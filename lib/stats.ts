import { all, first } from "./db";

/** Numbers for a member's page and box header. Two queries, no Jikan. */
export async function memberStats(userId: string) {
  const [s, streak] = await Promise.all([
    first<{ entries: number; completed: number; watching: number; episodes: number; mean: number | null; favs: number; comments: number; rated: number }>(
      `select count(*) as entries,
              sum(status = 'completed') as completed,
              sum(status = 'watching') as watching,
              coalesce(sum(progress), 0) as episodes,
              round(avg(score), 2) as mean,
              sum(favorite) as favs,
              (select count(*) from comments where user_id = ?1 and deleted = 0) as comments,
              count(score) as rated
       from library where user_id = ?1`,
      userId,
    ),
    all<{ day: string }>(
      `select distinct date(updated_at, 'unixepoch') as day from watch_progress where user_id = ? order by day desc limit 120`,
      userId,
    ),
  ]);
  // consecutive days with something watched, ending today or yesterday
  let run = 0;
  const days = new Set(streak.map((d) => d.day));
  const d = new Date();
  if (!days.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) { run++; d.setUTCDate(d.getUTCDate() - 1); }
  const episodes = Number(s?.episodes ?? 0);
  return {
    entries: Number(s?.entries ?? 0),
    completed: Number(s?.completed ?? 0),
    watching: Number(s?.watching ?? 0),
    episodes,
    hours: Math.round((episodes * 24) / 60),
    mean: s?.mean ?? null,
    favs: Number(s?.favs ?? 0),
    comments: Number(s?.comments ?? 0),
    rated: Number(s?.rated ?? 0),
    streak: run,
  };
}
