import { memberOr401 } from "@/lib/auth";
import { all, db, first, run } from "@/lib/db";
import { pullAnime, pullManga, viewer } from "@/lib/anilist";

// Link an AniList account and keep lists in step.
//   GET                          → { link: { username, hasToken, lastPull, lastPush, note } | null }
//   POST { op:"link", username, token? }   save the link (a token is checked, and also fixes the username)
//   POST { op:"pull" }                     import the AniList anime + manga lists
//   POST { op:"unlink" }                   forget the link (the token with it)
// Import never lowers anything you already have: progress keeps the larger value, a finished show
// stays finished, and your own score wins over theirs.
export async function GET() {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const l = await first<{ username: string; token: string | null; last_pull: number | null; last_push: number | null; note: string | null }>(
    "select username, token, last_pull, last_push, note from sync_links where user_id = ?", me.id,
  ).catch(() => null);
  return Response.json({ link: l ? { username: l.username, hasToken: !!l.token, lastPull: l.last_pull, lastPush: l.last_push, note: l.note } : null }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { op?: string; username?: string; token?: string };

  if (b.op === "unlink") {
    await run("delete from sync_links where user_id = ?", me.id);
    return Response.json({ ok: true });
  }

  if (b.op === "link") {
    let username = String(b.username || "").trim().replace(/^@/, "").slice(0, 40);
    const token = String(b.token || "").trim().slice(0, 4000) || null;
    if (token) {
      try { username = (await viewer(token)) || username; } catch { return Response.json({ error: "AniList didn't accept that token" }, { status: 400 }); }
    }
    if (!/^[\w-]{2,40}$/.test(username)) return Response.json({ error: "enter your AniList username" }, { status: 400 });
    await run(
      `insert into sync_links (user_id, provider, username, token) values (?, 'anilist', ?, ?)
       on conflict(user_id) do update set username = excluded.username, token = coalesce(excluded.token, sync_links.token), note = null`,
      me.id, username, token,
    );
    return Response.json({ ok: true, username, hasToken: !!token });
  }

  if (b.op === "pull") {
    const link = await first<{ username: string }>("select username from sync_links where user_id = ?", me.id);
    if (!link) return Response.json({ error: "link your AniList first" }, { status: 400 });
    let anime, manga;
    try { [anime, manga] = await Promise.all([pullAnime(link.username), pullManga(link.username)]); }
    catch (e) { return Response.json({ error: `AniList said: ${(e as Error).message}` }, { status: 502 }); }

    const d = await db();
    const stmts = [
      ...anime.map((a) =>
        d.prepare(
          `insert into library (user_id, mal_id, status, score, progress, title, image, episodes, kind, rewatching, rewatches, started_at, finished_at, updated_at)
           values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, case when ?3 in ('watching','completed') then unixepoch() end, case when ?3 = 'completed' then unixepoch() end, unixepoch())
           on conflict(user_id, mal_id) do update set
             status = case when excluded.status = 'completed' or library.status is null then excluded.status else library.status end,
             progress = max(library.progress, excluded.progress),
             score = coalesce(library.score, excluded.score),
             episodes = coalesce(library.episodes, excluded.episodes),
             image = coalesce(library.image, excluded.image),
             rewatching = case when excluded.rewatching = 1 then 1 else library.rewatching end,
             rewatches = max(library.rewatches, excluded.rewatches),
             finished_at = case when excluded.status = 'completed' then coalesce(library.finished_at, unixepoch()) else library.finished_at end,
             updated_at = unixepoch()`,
        ).bind(me.id, a.malId, a.status, a.score, a.status === "completed" && a.episodes ? Math.max(a.progress, a.episodes) : a.progress, a.title.slice(0, 200), a.image, a.episodes, a.format, a.rewatching ? 1 : 0, a.repeat),
      ),
      ...manga.map((m) =>
        d.prepare(
          `insert into manga_tracked (user_id, anilist_id, title, cover, status, progress, updated_at) values (?, ?, ?, ?, ?, ?, unixepoch())
           on conflict(user_id, anilist_id) do update set title = excluded.title, cover = excluded.cover, status = excluded.status, progress = max(manga_tracked.progress, excluded.progress), updated_at = unixepoch()`,
        ).bind(me.id, m.anilistId, m.title.slice(0, 200), m.cover, m.status, m.progress),
      ),
    ];
    for (let i = 0; i < stmts.length; i += 80) await d.batch(stmts.slice(i, i + 80));
    await run("update sync_links set last_pull = unixepoch(), note = null where user_id = ?", me.id);
    const total = (await all<{ n: number }>("select count(*) as n from library where user_id = ?", me.id))[0]?.n ?? 0;
    return Response.json({ ok: true, anime: anime.length, manga: manga.length, total });
  }
  return Response.json({ error: "unknown op" }, { status: 400 });
}
