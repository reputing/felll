import { all } from "./db";

// What a member has done with movies and series, for the pages that show it. Every call returns an empty list when the
// movie tables are not in the database yet (migration 0021), so a page never breaks over them.
export interface ContinueItem { imdb_id: string; media: "movie" | "tv"; season: number; episode: number; position: number; duration: number; watched: number; title: string; poster: string | null; year: number | null; ep_title: string | null; updated_at: number }
export interface ListItem { imdb_id: string; media: "movie" | "tv"; status: string | null; score: number | null; favorite: number; progress: number; episodes: number | null; title: string; poster: string | null; year: number | null; updated_at: number }

export const slugOf = (media: string, imdb: string) => `${media}-${imdb}`;
export const posterOf = (imdb: string) => `https://images.metahub.space/poster/small/${imdb}/img`;

/** One row per title, the latest thing watched: a film until it is finished, a series always (the page picks the next episode). */
export async function continueWatching(userId: string, limit = 18): Promise<ContinueItem[]> {
  try {
    const rows = await all<ContinueItem>(
      `select imdb_id, media, season, episode, position, duration, watched, title, poster, year, ep_title, updated_at from (
         select p.*, row_number() over (partition by p.imdb_id order by p.updated_at desc, p.season desc, p.episode desc) as rn
           from movie_progress p where p.user_id = ?1
       ) where rn = 1 order by updated_at desc limit 80`, userId);
    // a finished film is done; a series whose list entry is completed or dropped is too
    const lib = await all<{ imdb_id: string; status: string | null }>("select imdb_id, status from movie_library where user_id = ?", userId).catch(() => []);
    const st = new Map(lib.map((l) => [l.imdb_id, l.status]));
    return rows.filter((r) => !(r.media === "movie" && r.watched) && st.get(r.imdb_id) !== "completed" && st.get(r.imdb_id) !== "dropped").slice(0, limit);
  } catch { return []; }
}

export async function movieList(userId: string): Promise<ListItem[]> {
  try {
    return await all<ListItem>("select imdb_id, media, status, score, favorite, progress, episodes, title, poster, year, updated_at from movie_library where user_id = ? order by updated_at desc limit 1000", userId);
  } catch { return []; }
}
