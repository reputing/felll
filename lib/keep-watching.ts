// The cards of the "Keep watching" rail and the mappers that make them. This file is plain TypeScript on purpose: the pages that
// build the cards run on the server, and a function exported from a "use client" file cannot be called there (it crashed the home
// page for anyone with something to resume).
export interface Resume { mal_id: number; episode: number; position: number; duration: number; title: string; image: string | null; updated_at?: number }

/** One card of the rail: anime, a film or an episode of a series, all drawn the same way. */
export interface KWItem {
  key: string; href: string; image: string | null;
  /** the chip on the picture: "EP 5", "S2 E3", "FILM" */
  badge: string; title: string;
  /** a second small line under the title (an episode's name), when there is one */
  sub?: string | null;
  position: number; duration: number;
  /** DELETE this to take the card off the rail */
  removeUrl: string;
  /** for ordering a mixed rail, newest first */
  at?: number;
}

export const animeKW = (r: Resume): KWItem => ({
  key: `a${r.mal_id}`, href: `/watch/${r.mal_id}/${r.episode}`, image: r.image, badge: `EP ${r.episode}`, title: r.title,
  position: r.position, duration: r.duration, removeUrl: `/api/progress?malId=${r.mal_id}`, at: r.updated_at ?? 0,
});
