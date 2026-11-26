// How big the films and series catalog is, as a rounded number for the page (like "every anime"). Basis: TMDB's public daily id
// exports of 11 Nov 2026 held 1,273,981 films and 236,469 series, and Zeus plays by TMDB id, so that is the playable catalog.
// Rounded down on purpose; it only needs to be right to the nearest hundred thousand.
export const CATALOG = { all: "1.5M+", movie: "1.2M+", tv: "230k+" } as const;
