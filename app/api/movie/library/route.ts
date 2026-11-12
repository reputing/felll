import { memberOr401 } from "@/lib/auth";
import { all, db, first } from "@/lib/db";
import { isStatus, type ListStatus } from "@/lib/utils";

// A member's movies and series: the counterpart of /api/library (anime) and /api/manga/library.
//   GET            → { library: [...] }   everything they have saved, rated or favourited
//   GET ?id=tt…    → { entry | null }     one title's state
//   POST { imdb, media, title, poster?, year?, episodes?, status?, score?, favorite?, progress? }
// Any combination can be sent; clearing status, score and favourite removes the row.
const IMDB = /^tt\d{5,10}$/;

type Row = { status: ListStatus | null; score: number | null; favorite: number; progress: number; episodes: number | null; started_at: number | null; finished_at: number | null };

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const entry = await first<Row & { media: string }>("select media, status, score, favorite, progress, episodes from movie_library where user_id = ? and imdb_id = ?", me.id, id);
    return Response.json({ entry: entry ? { ...entry, favorite: !!entry.favorite } : null }, { headers: { "cache-control": "no-store" } });
  }
  const library = await all("select imdb_id, media, status, score, favorite, progress, episodes, title, poster, year, updated_at from movie_library where user_id = ? order by updated_at desc limit 1000", me.id);
  return Response.json({ library }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { imdb?: string; media?: string; title?: string; poster?: string | null; year?: number | null; episodes?: number | null; status?: ListStatus | null; score?: number | null; favorite?: boolean; progress?: number };
  const imdb = String(b.imdb || "");
  if (!IMDB.test(imdb) || (b.media !== "movie" && b.media !== "tv") || !b.title) return Response.json({ error: "which title?" }, { status: 400 });
  if ("status" in b && b.status !== null && !isStatus(b.status)) return Response.json({ error: "bad status" }, { status: 400 });
  if ("score" in b && b.score !== null && !(Number.isInteger(b.score) && b.score! >= 1 && b.score! <= 10)) return Response.json({ error: "scores are 1 to 10" }, { status: 400 });

  const old = await first<Row>("select status, score, favorite, progress, episodes, started_at, finished_at from movie_library where user_id = ? and imdb_id = ?", me.id, imdb);
  const episodes = Number.isInteger(b.episodes) && b.episodes! > 0 ? b.episodes! : old?.episodes ?? null;
  const next: Row = {
    status: "status" in b ? b.status ?? null : old?.status ?? null,
    score: "score" in b ? b.score ?? null : old?.score ?? null,
    favorite: "favorite" in b ? (b.favorite ? 1 : 0) : old?.favorite ?? 0,
    progress: Math.max(0, Math.min(Number.isInteger(b.progress) ? b.progress! : old?.progress ?? 0, episodes ?? 9999)),
    episodes,
    started_at: old?.started_at ?? null,
    finished_at: old?.finished_at ?? null,
  };
  const t = Math.floor(Date.now() / 1000);
  if (next.status === "watching" && !next.started_at) next.started_at = t;
  if (next.status === "completed") {
    next.finished_at ??= t;
    if (b.media === "tv" && episodes) next.progress = episodes;
  }
  const d = await db();
  if (!next.status && !next.score && !next.favorite) {
    await d.prepare("delete from movie_library where user_id = ? and imdb_id = ?").bind(me.id, imdb).run();
  } else {
    await d.prepare(
      `insert into movie_library (user_id, imdb_id, media, status, score, favorite, progress, title, poster, year, episodes, started_at, finished_at, updated_at)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, unixepoch())
       on conflict(user_id, imdb_id) do update set status = ?4, score = ?5, favorite = ?6, progress = ?7, title = ?8,
         poster = coalesce(?9, movie_library.poster), year = coalesce(?10, movie_library.year), episodes = coalesce(?11, movie_library.episodes),
         started_at = ?12, finished_at = ?13, updated_at = unixepoch()`,
    ).bind(me.id, imdb, b.media, next.status, next.score, next.favorite, next.progress, String(b.title).slice(0, 200), b.poster ? String(b.poster).slice(0, 400) : null, Number.isInteger(b.year) ? b.year : null, episodes, next.started_at, next.finished_at).run();
  }
  return Response.json({ ok: true, entry: { ...next, favorite: !!next.favorite } });
}
