import type { KWItem } from "@/lib/keep-watching";
import { cinemaDetail } from "./cinema";
import type { ContinueItem } from "./movie-user";

/** A film or series the member is part-way through, as a card of the shared "Keep watching" rail (same card as anime). */
export function movieKW(r: ContinueItem): KWItem {
  const tv = r.media === "tv";
  return {
    key: `m${r.imdb_id}`,
    // a finished episode sends you to the series page, which opens on the next one
    href: tv ? `/movies/tv-${r.imdb_id}${r.watched ? "" : `?se=${r.season}&ep=${r.episode}`}` : `/movies/movie-${r.imdb_id}`,
    // landscape art, like an anime's episode still; the poster is the fallback the card shows if that one is missing
    image: `https://images.metahub.space/background/small/${r.imdb_id}/img`,
    badge: tv ? (r.watched ? "NEXT UP" : `S${r.season} E${r.episode}`) : "FILM",
    title: r.title,
    sub: tv ? (r.watched ? `after S${r.season} E${r.episode}` : r.ep_title) : null,
    position: r.watched ? 0 : r.position, duration: r.watched ? 0 : r.duration,
    removeUrl: `/api/movie/progress?imdb=${r.imdb_id}`, at: r.updated_at,
  };
}

const DAY = 86_400_000;
const slow = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/**
 * The "Keep watching" cards for films and series, with new-episode tracking. A series whose last episode is finished used to
 * say "NEXT UP" whether or not there was a next one. Now the catalog is asked (cached, so it is cheap): a new episode that has
 * aired shows as "NEW EP" (or "NEXT UP" once it is a few weeks old) and opens on that episode; a series with nothing new yet
 * leaves the rail until something airs. If the catalog does not answer in time the card stays as it was, so a slow upstream
 * never hides what you were watching.
 */
export async function movieKeep(items: ContinueItem[]): Promise<KWItem[]> {
  const finished = items.filter((r) => r.media === "tv" && r.watched).slice(0, 8);
  const next = new Map<string, { state: "out" | "none"; se: number; ep: number; title: string; at: number | null }>();
  await Promise.all(finished.map(async (r) => {
    const d = await slow(cinemaDetail("tv", r.imdb_id).catch(() => null), 2500);
    if (!d || !d.episodes.length) return; // unknown: leave the card alone
    const i = d.episodes.findIndex((e) => e.se === r.season && e.ep === r.episode);
    if (i < 0) return;
    const n = d.episodes.slice(i + 1).find((e) => !e.aired || Date.parse(e.aired) <= Date.now());
    next.set(r.imdb_id, n ? { state: "out", se: n.se, ep: n.ep, title: n.title, at: n.aired ? Date.parse(n.aired) : null } : { state: "none", se: 0, ep: 0, title: "", at: null });
  }));
  const out: KWItem[] = [];
  for (const r of items) {
    const n = next.get(r.imdb_id);
    const card = movieKW(r);
    if (!n) { out.push(card); continue; }
    if (n.state === "none") continue;
    const fresh = n.at != null && Date.now() - n.at < 21 * DAY;
    out.push({ ...card, href: `/movies/tv-${r.imdb_id}?se=${n.se}&ep=${n.ep}`, badge: fresh ? "NEW EP" : "NEXT UP", sub: `S${n.se} E${n.ep} · ${n.title}`, at: fresh && n.at ? Math.max(card.at ?? 0, Math.floor(n.at / 1000)) : card.at });
  }
  return out;
}
