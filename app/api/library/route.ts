import { memberOr401 } from "@/lib/auth";
import { db, first } from "@/lib/db";
import { isStatus, STATUS_LABEL, type ListStatus } from "@/lib/utils";

interface Body {
  anime?: { id?: number; title?: string; poster?: string | null; episodes?: number | null; format?: string };
  status?: ListStatus | null;
  score?: number | null;
  favorite?: boolean;
  progress?: number;
}

type Row = { status: ListStatus | null; score: number | null; favorite: number; progress: number; started_at: number | null; finished_at: number | null };

// Save / rate / favourite / progress, in any combination. Clearing everything
// removes the row. Each real change lands in the activity feed.
export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as Body;
  const a = b.anime;
  const id = Number(a?.id);
  if (!Number.isInteger(id) || id <= 0 || !a?.title) return Response.json({ error: "which anime?" }, { status: 400 });
  if ("status" in b && b.status !== null && !isStatus(b.status)) return Response.json({ error: "bad status" }, { status: 400 });
  if ("score" in b && b.score !== null && !(Number.isInteger(b.score) && b.score! >= 1 && b.score! <= 10)) return Response.json({ error: "scores are 1–10" }, { status: 400 });

  const old = await first<Row>("select status, score, favorite, progress, started_at, finished_at from library where user_id = ? and mal_id = ?", me.id, id);
  const episodes = Number.isInteger(a.episodes) ? a.episodes! : null;
  const next: Row = {
    status: "status" in b ? b.status ?? null : old?.status ?? null,
    score: "score" in b ? b.score ?? null : old?.score ?? null,
    favorite: "favorite" in b ? (b.favorite ? 1 : 0) : old?.favorite ?? 0,
    progress: Math.max(0, Math.min(Number.isInteger(b.progress) ? b.progress! : old?.progress ?? 0, episodes ?? 9999)),
    started_at: old?.started_at ?? null,
    finished_at: old?.finished_at ?? null,
  };
  const t = Math.floor(Date.now() / 1000);
  if (next.status === "watching" && !next.started_at) next.started_at = t;
  if (next.status === "completed") {
    next.finished_at ??= t;
    if (episodes) next.progress = episodes;
  }

  const title = String(a.title).slice(0, 200);
  const image = a.poster ? String(a.poster).slice(0, 400) : null;
  const d = await db();
  const stmts = [];
  if (!next.status && !next.score && !next.favorite) {
    stmts.push(d.prepare("delete from library where user_id = ? and mal_id = ?").bind(me.id, id));
  } else {
    stmts.push(
      d
        .prepare(
          `insert into library (user_id, mal_id, status, score, favorite, progress, title, image, episodes, kind, started_at, finished_at, updated_at)
           values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, unixepoch())
           on conflict(user_id, mal_id) do update set status = ?3, score = ?4, favorite = ?5, progress = ?6, title = ?7,
             image = coalesce(?8, library.image), episodes = coalesce(?9, library.episodes), kind = coalesce(?10, library.kind),
             started_at = ?11, finished_at = ?12, updated_at = unixepoch()`,
        )
        .bind(me.id, id, next.status, next.score, next.favorite, next.progress, title, image, episodes, a.format ?? null, next.started_at, next.finished_at),
    );
  }
  const log = (kind: string, detail: string) =>
    stmts.push(d.prepare("insert into activity (user_id, kind, mal_id, title, image, detail) values (?, ?, ?, ?, ?, ?)").bind(me.id, kind, id, title, image, detail));
  if (next.status && next.status !== (old?.status ?? null)) log("status", STATUS_LABEL[next.status]);
  if (next.score && next.score !== (old?.score ?? null)) log("rated", String(next.score));
  if (next.favorite && !old?.favorite) log("favorite", "");
  await d.batch(stmts);
  return Response.json({ ok: true, entry: { ...next, favorite: !!next.favorite } });
}
