import { memberOr401 } from "@/lib/auth";
import { db, first } from "@/lib/db";
import { pushToAnilist } from "@/lib/sync";

interface Body {
  malId?: number; ep?: number; position?: number; duration?: number; start?: boolean;
  title?: string; image?: string | null; episodes?: number | null; format?: string;
}

// The player reports where you are every ~15s. Past 85% the episode counts as
// watched: your list progress moves on (and the show completes on the last one).
export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as Body;
  const malId = Number(b.malId), ep = Number(b.ep);
  if (!Number.isInteger(malId) || !Number.isInteger(ep) || ep < 1) return Response.json({ error: "bad" }, { status: 400 });
  const pos = Math.max(0, Number(b.position) || 0), dur = Math.max(0, Number(b.duration) || 0);
  const title = String(b.title || "").slice(0, 200);
  const image = b.image ? String(b.image).slice(0, 400) : null;
  const d = await db();
  const stmts = [
    d
      .prepare(
        `insert into watch_progress (user_id, mal_id, episode, position, duration, title, image, updated_at) values (?, ?, ?, ?, ?, ?, ?, unixepoch())
         on conflict(user_id, mal_id, episode) do update set position = excluded.position, duration = excluded.duration, updated_at = excluded.updated_at`,
      )
      .bind(me.id, malId, ep, pos, dur, title, image),
  ];
  if (b.start) {
    stmts.push(
      d.prepare(
        `insert into daily_views (mal_id, day, views, title, image) values (?, date('now'), 1, ?, ?)
         on conflict(mal_id, day) do update set views = views + 1`,
      ).bind(malId, title, image),
    );
  }
  let finished = false;
  const lib = await first<{ progress: number; status: string | null; rewatching: number }>("select progress, status, rewatching from library where user_id = ? and mal_id = ?", me.id, malId);
  const totalEps = Number.isInteger(b.episodes) ? b.episodes! : null;
  // Watching something you already finished is a rewatch: flag it (and tell AniList "repeating"),
  // and when the last episode is done again, count it and clear the flag.
  if (lib?.status === "completed") {
    const lastDone = !!totalEps && ep >= totalEps && dur > 0 && pos / dur >= 0.85;
    if (lib.rewatching && lastDone) {
      stmts.push(d.prepare("update library set rewatching = 0, rewatches = rewatches + 1, updated_at = unixepoch() where user_id = ? and mal_id = ?").bind(me.id, malId));
      pushToAnilist(me.id, malId, { status: "completed", progress: totalEps ?? ep });
    } else if (!lib.rewatching && !lastDone && pos > 30) {
      stmts.push(d.prepare("update library set rewatching = 1, updated_at = unixepoch() where user_id = ? and mal_id = ?").bind(me.id, malId));
      pushToAnilist(me.id, malId, { status: "completed", progress: ep, rewatching: true });
    }
  }
  if (dur > 0 && pos / dur >= 0.85) {
    if (!lib || lib.progress < ep) {
      finished = true;
      const total = Number.isInteger(b.episodes) ? b.episodes! : null;
      const status = total && ep >= total ? "completed" : "watching";
      stmts.push(
        d
          .prepare(
            `insert into library (user_id, mal_id, status, progress, title, image, episodes, kind, started_at, finished_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, unixepoch(), case when ?3 = 'completed' then unixepoch() end, unixepoch())
             on conflict(user_id, mal_id) do update set progress = max(library.progress, ?4),
               status = case when ?3 = 'completed' then 'completed' when library.status in ('completed','dropped') then library.status else 'watching' end,
               started_at = coalesce(library.started_at, unixepoch()),
               finished_at = case when ?3 = 'completed' then unixepoch() else library.finished_at end, updated_at = unixepoch()`,
          )
          .bind(me.id, malId, status, ep, title, image, total, b.format ?? null),
        d.prepare("insert into activity (user_id, kind, mal_id, episode, title, image) values (?, 'finished_episode', ?, ?, ?, ?)").bind(me.id, malId, ep, title, image),
      );
    }
  }
  await d.batch(stmts);
  if (finished) pushToAnilist(me.id, malId, { status: totalEps && ep >= totalEps ? "completed" : "watching", progress: ep });
  return Response.json({ ok: true, finished });
}

export async function DELETE(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  // ?malId=… takes one show off "Keep watching" (e.g. you dropped it); no param clears everything
  const one = Number(new URL(req.url).searchParams.get("malId"));
  if (Number.isInteger(one) && one > 0) {
    await (await db()).prepare("delete from watch_progress where user_id = ? and mal_id = ?").bind(me.id, one).run();
    return Response.json({ ok: true });
  }
  await (await db()).prepare("delete from watch_progress where user_id = ?").bind(me.id).run();
  return Response.json({ ok: true });
}
