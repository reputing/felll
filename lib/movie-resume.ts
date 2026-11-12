import type { KWItem } from "@/lib/keep-watching";
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
