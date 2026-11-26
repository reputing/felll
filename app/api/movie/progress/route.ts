import { memberOr401 } from "@/lib/auth";
import { all, db, first } from "@/lib/db";

// Where a member is in a film or an episode: the counterpart of /api/progress (anime).
//   GET ?imdb=tt…      → { episodes: [{ season, episode, position, duration, watched }] }  one title's history
//   GET ?recent=1      → { items: [...] }  what to continue: the unfinished film or the next episode, newest first
//   POST { imdb, media, season?, episode?, position?, duration?, watched?, title, poster?, year?, epTitle?, episodes? }
//   DELETE ?imdb=tt…   → forget one title (off "continue watching"); no param clears everything
// An episode counts as watched at 90% played or when the member says so. A watched film completes in the list; a series
// moves to "watching" and completes when every aired episode is watched.
const IMDB = /^tt\d{5,10}$/;

type Item = { imdb_id: string; media: string; season: number; episode: number; position: number; duration: number; watched: number; title: string; poster: string | null; year: number | null; ep_title: string | null; updated_at: number };

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const u = new URL(req.url).searchParams;
  const imdb = u.get("imdb");
  if (imdb) {
    const episodes = await all("select season, episode, position, duration, watched from movie_progress where user_id = ? and imdb_id = ? order by season, episode", me.id, imdb);
    return Response.json({ episodes }, { headers: { "cache-control": "no-store" } });
  }
  // continue watching: per title, the most recent row. A film is offered until it is watched; a series offers the episode
  // being watched, or the next one once that is watched (the page works out which; here we just return the latest row).
  const rows = await all<Item>(
    `select imdb_id, media, season, episode, position, duration, watched, title, poster, year, ep_title, updated_at from (
       select p.*, row_number() over (partition by p.imdb_id order by p.updated_at desc, p.season desc, p.episode desc) as rn
         from movie_progress p where p.user_id = ?1
     ) where rn = 1 order by updated_at desc limit 60`,
    me.id,
  );
  const items = u.get("all") ? rows : rows.filter((r) => !(r.media === "movie" && r.watched));
  return Response.json({ items }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { imdb?: string; media?: string; season?: number; episode?: number; position?: number; duration?: number; watched?: boolean; unwatch?: boolean; title?: string; poster?: string | null; year?: number | null; epTitle?: string | null; episodes?: number | null };
  const imdb = String(b.imdb || "");
  if (!IMDB.test(imdb) || (b.media !== "movie" && b.media !== "tv") || !b.title) return Response.json({ error: "which title?" }, { status: 400 });
  const tv = b.media === "tv";
  // no series has a season 1000000000: an impossible number is refused rather than stored (it would show up as "where you left off")
  const season = tv ? Math.max(1, Number(b.season) || 1) : 0;
  const episode = tv ? Math.max(1, Number(b.episode) || 1) : 0;
  if (season > 200 || episode > 10000) return Response.json({ error: "no such episode" }, { status: 400 });
  const pos = Math.max(0, Number(b.position) || 0), dur = Math.max(0, Number(b.duration) || 0);
  const done = !b.unwatch && (!!b.watched || (dur > 60 && pos / dur >= 0.9));
  const title = String(b.title).slice(0, 200);
  const poster = b.poster ? String(b.poster).slice(0, 400) : null;
  const year = Number.isInteger(b.year) ? b.year! : null;
  const d = await db();

  await d.prepare(
    `insert into movie_progress (user_id, imdb_id, season, episode, media, position, duration, watched, title, poster, year, ep_title, updated_at)
     values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, unixepoch())
     on conflict(user_id, imdb_id, season, episode) do update set
       position = case when ?13 = 1 then 0 else ?6 end, duration = case when ?7 > 0 then ?7 else movie_progress.duration end,
       watched = case when ?13 = 1 then 0 when ?8 = 1 then 1 else movie_progress.watched end,
       title = ?9, poster = coalesce(?10, movie_progress.poster), year = coalesce(?11, movie_progress.year), ep_title = coalesce(?12, movie_progress.ep_title), updated_at = unixepoch()`,
  ).bind(me.id, imdb, season, episode, b.media, pos, dur, done ? 1 : 0, title, poster, year, b.epTitle ? String(b.epTitle).slice(0, 200) : null, b.unwatch ? 1 : 0).run();

  // keep the list in step: watching a film completes it, watching episodes moves a series along
  const lib = await first<{ status: string | null; episodes: number | null; started_at: number | null }>("select status, episodes, started_at from movie_library where user_id = ? and imdb_id = ?", me.id, imdb);
  const totalEps = Number.isInteger(b.episodes) && b.episodes! > 0 ? b.episodes! : lib?.episodes ?? null;
  const watchedEps = tv ? (await first<{ n: number }>("select count(*) as n from movie_progress where user_id = ? and imdb_id = ? and watched = 1 and season >= 1", me.id, imdb))?.n ?? 0 : 0;
  const completed = tv ? !!totalEps && watchedEps >= totalEps : done;
  if (done || (pos > 30 && !b.unwatch) || b.unwatch) {
    const keep = lib?.status === "completed" || lib?.status === "dropped";
    const status = completed && !b.unwatch ? "completed" : keep && !completed && !b.unwatch ? lib!.status : "watching";
    await d.prepare(
      `insert into movie_library (user_id, imdb_id, media, status, progress, title, poster, year, episodes, started_at, finished_at, updated_at)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, unixepoch(), case when ?4 = 'completed' then unixepoch() end, unixepoch())
       on conflict(user_id, imdb_id) do update set progress = ?5, status = case when ?4 = 'completed' then 'completed' when movie_library.status is null then ?4 when movie_library.status in ('planning','paused') then 'watching' else movie_library.status end,
         episodes = coalesce(?9, movie_library.episodes), started_at = coalesce(movie_library.started_at, unixepoch()),
         finished_at = case when ?4 = 'completed' then coalesce(movie_library.finished_at, unixepoch()) else movie_library.finished_at end, updated_at = unixepoch()`,
    ).bind(me.id, imdb, b.media, status, watchedEps, title, poster, year, totalEps).run();
  }
  return Response.json({ ok: true, watched: done, progress: watchedEps, completed });
}

export async function DELETE(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const one = new URL(req.url).searchParams.get("imdb");
  const d = await db();
  if (one) await d.prepare("delete from movie_progress where user_id = ? and imdb_id = ?").bind(me.id, one).run();
  else await d.prepare("delete from movie_progress where user_id = ?").bind(me.id).run();
  return Response.json({ ok: true });
}
