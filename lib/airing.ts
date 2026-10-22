import { all, run } from "./db";
import { episodeAt, getAnime, nextAiring } from "./jikan";

// Alert followers when a new episode of an airing show they follow goes out.
// Run from the warm cron (/api/warm) every ~20 min. Each follow stores the
// highest episode we've alerted it about, so nobody gets pinged twice.
export async function runAiringCheck(): Promise<void> {
  let follows: { user_id: string; mal_id: number; last_ep: number }[] = [];
  try {
    follows = await all("select user_id, mal_id, last_ep from show_follows");
  } catch {
    return; // table not ready yet
  }
  if (!follows.length) return;

  const byShow = new Map<number, { user_id: string; last_ep: number }[]>();
  for (const f of follows) {
    const list = byShow.get(f.mal_id) ?? [];
    list.push({ user_id: f.user_id, last_ep: f.last_ep });
    byShow.set(f.mal_id, list);
  }

  const now = Math.floor(Date.now() / 1000);
  for (const [malId, fans] of byShow) {
    const a = await getAnime(malId).catch(() => null);
    if (!a || !a.airing) continue;
    const aired = nextAiring(a) ? episodeAt(a, now) : null;
    if (aired == null) continue;
    for (const f of fans) {
      if (f.last_ep >= aired) continue;
      try {
        await run(
          "insert into notifications (user_id, kind, mal_id, episode, text) values (?, 'episode_aired', ?, ?, ?)",
          f.user_id, malId, aired, `Episode ${aired} of ${a.title} just aired`,
        );
        await run("update show_follows set last_ep = ? where user_id = ? and mal_id = ?", aired, f.user_id, malId);
      } catch {
        /* keep going for the rest */
      }
    }
  }
}
