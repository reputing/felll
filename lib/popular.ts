import { all } from "./db";
import type { Anime } from "./jikan";
import { compact } from "./utils";

// "Most popular", by window. Today, this week and this month are what members actually played here (daily_views, which is
// pruned at 60 days, so there is no honest "all time" of our own). All time is the catalog's own popularity (MAL members).
// A small community has quiet days, so a window that has fewer than `limit` plays is topped up from the catalog's popular
// list and those entries are marked `hot: false`, so the board is never half empty and never pretends a fan count is plays.
export type Range = "day" | "week" | "month" | "all";
export const RANGES: { id: Range; label: string }[] = [
  { id: "day", label: "Today" }, { id: "week", label: "This week" }, { id: "month", label: "This month" }, { id: "all", label: "All time" },
];
export interface PopularItem { id: number; title: string; image: string | null; note: string; hot: boolean }

const SINCE: Record<Exclude<Range, "all">, string> = { day: "date('now')", week: "date('now', '-6 days')", month: "date('now', '-29 days')" };

const fromCatalog = (a: Anime): PopularItem => ({ id: a.id, title: a.title, image: a.posterSm, note: `${compact(a.members)} fans`, hot: false });

async function played(range: Exclude<Range, "all">, limit: number): Promise<PopularItem[]> {
  // SINCE holds fixed SQL fragments (never user input), so it is interpolated rather than bound
  const rows = await all<{ mal_id: number; title: string | null; image: string | null; views: number }>(
    `select mal_id, max(title) as title, max(image) as image, sum(views) as views from daily_views where day >= ${SINCE[range]} group by mal_id order by views desc limit ?`,
    limit,
  ).catch(() => []);
  return rows.filter((r) => r.title).map((r) => ({ id: r.mal_id, title: r.title as string, image: r.image, note: `${compact(r.views)} play${r.views === 1 ? "" : "s"}`, hot: true }));
}

/** Every window at once, from one catalog list (the home page already has it). */
export async function popularBoards(catalog: Anime[], limit = 10): Promise<Record<Range, PopularItem[]>> {
  const byFans = [...catalog].sort((a, b) => b.members - a.members).map(fromCatalog);
  const top = (xs: PopularItem[]) => {
    const seen = new Set(xs.map((x) => x.id));
    return [...xs, ...byFans.filter((x) => !seen.has(x.id))].slice(0, limit);
  };
  const [day, week, month] = await Promise.all([played("day", limit), played("week", limit), played("month", limit)]);
  return { day: top(day), week: top(week), month: top(month), all: byFans.slice(0, limit) };
}

/** One window, longer, for the rankings page. */
export async function popularList(range: Exclude<Range, "all">, limit = 50): Promise<PopularItem[]> {
  return played(range, limit);
}
