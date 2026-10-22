// Jikan request paths and the catalog row shape, shared by the Worker
// (lib/jikan.ts) and the sync script (scripts/sync-jikan.ts). The sync writes
// responses into jikan_cache under these exact keys, so the two must agree.

export const SEASONS = ["winter", "spring", "summer", "fall"] as const;
export type SeasonName = (typeof SEASONS)[number];
export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const TOP_LISTS = {
  airing: { label: "Top airing", path: "/top/anime?filter=airing" },
  upcoming: { label: "Most anticipated", path: "/top/anime?filter=upcoming" },
  all: { label: "All time", path: "/top/anime?" },
  popular: { label: "Most popular", path: "/top/anime?filter=bypopularity" },
  loved: { label: "Most loved", path: "/top/anime?filter=favorite" },
  films: { label: "Top films", path: "/top/anime?type=movie" },
} as const;
export type TopList = keyof typeof TOP_LISTS;

export const PATHS = {
  homeAiring: "/top/anime?filter=airing&limit=25&sfw=true",
  homeSeason: "/seasons/now?limit=25&sfw=true",
  homeTop: "/top/anime?limit=25&sfw=true",
  homePopular: "/top/anime?filter=bypopularity&limit=25&sfw=true",
  homeUpcoming: "/seasons/upcoming?limit=25&sfw=true",
  genres: "/genres/anime",
  full: (id: number) => `/anime/${id}/full`,
  episodes: (id: number, page = 1) => `/anime/${id}/episodes?page=${page}`,
  characters: (id: number) => `/anime/${id}/characters`,
  recommendations: (id: number) => `/anime/${id}/recommendations`,
  statistics: (id: number) => `/anime/${id}/statistics`,
  season: (year: number, season: SeasonName, page = 1) => `/seasons/${year}/${season}?page=${page}&sfw=true`,
  upcoming: (page = 1) => `/seasons/upcoming?page=${page}&sfw=true`,
  schedule: (day: Weekday) => `/schedules?filter=${day}&sfw=true&limit=25`,
  top: (list: TopList, page = 1) => {
    const base = TOP_LISTS[list].path;
    return `${base}${base.endsWith("?") ? "" : "&"}page=${page}&limit=25&sfw=true`;
  },
};

export function currentSeason(d = new Date()): { year: number; season: SeasonName } {
  const m = d.getUTCMonth();
  return { year: d.getUTCFullYear(), season: m < 3 ? "winter" : m < 6 ? "spring" : m < 9 ? "summer" : "fall" };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

export const isAdult = (m: Raw) => /^Rx/.test(m?.rating ?? "") || (m?.genres ?? []).some((g: Raw) => g.name === "Hentai");

/** Just the fields the site reads, so cached pages stay well under D1's 100 KB statement limit. */
export function trimAnime(m: Raw, synopsisMax = 100_000): Raw {
  const syn = String(m.synopsis ?? "");
  return {
    mal_id: m.mal_id,
    title: m.title,
    title_english: m.title_english ?? null,
    title_japanese: m.title_japanese ?? null,
    title_synonyms: (m.title_synonyms ?? []).slice(0, 6),
    images: {
      webp: { image_url: m.images?.webp?.image_url ?? null, large_image_url: m.images?.webp?.large_image_url ?? null },
      jpg: { image_url: m.images?.jpg?.image_url ?? null, large_image_url: m.images?.jpg?.large_image_url ?? null },
    },
    trailer: m.trailer ? { youtube_id: m.trailer.youtube_id ?? null, embed_url: m.trailer.embed_url ?? null } : null,
    type: m.type ?? null,
    source: m.source ?? null,
    episodes: m.episodes ?? null,
    status: m.status ?? null,
    airing: !!m.airing,
    aired: { from: m.aired?.from ?? null, string: m.aired?.string ?? null, prop: { from: { year: m.aired?.prop?.from?.year ?? null } } },
    duration: m.duration ?? null,
    rating: m.rating ?? null,
    score: m.score ?? null,
    scored_by: m.scored_by ?? null,
    rank: m.rank ?? null,
    popularity: m.popularity ?? null,
    members: m.members ?? 0,
    favorites: m.favorites ?? 0,
    synopsis: syn.length > synopsisMax ? syn.slice(0, synopsisMax).replace(/\s+\S*$/, "") + "…" : syn,
    background: synopsisMax >= 100_000 ? m.background ?? null : null,
    season: m.season ?? null,
    year: m.year ?? null,
    broadcast: { day: m.broadcast?.day ?? null, time: m.broadcast?.time ?? null, timezone: m.broadcast?.timezone ?? null },
    studios: (m.studios ?? []).map((s: Raw) => ({ name: s.name })),
    genres: (m.genres ?? []).map((g: Raw) => ({ mal_id: g.mal_id, name: g.name })),
    themes: (m.themes ?? []).map((g: Raw) => ({ mal_id: g.mal_id, name: g.name })),
    demographics: (m.demographics ?? []).map((g: Raw) => ({ name: g.name })),
    ...(m.relations ? { relations: m.relations } : {}),
    ...(m.theme ? { theme: m.theme } : {}),
    ...(m.streaming ? { streaming: m.streaming } : {}),
  };
}

/** The searchable columns of a catalog row. */
export function catalogColumns(m: Raw) {
  const titles = [m.title, m.title_english, m.title_japanese, ...(m.title_synonyms ?? [])].filter(Boolean).join(" ");
  const genres = [...(m.genres ?? []), ...(m.themes ?? []), ...(m.demographics ?? [])].map((g: Raw) => g.name);
  return {
    mal_id: m.mal_id as number,
    search: titles.toLowerCase(),
    members: (m.members ?? 0) as number,
    favorites: (m.favorites ?? 0) as number,
    score: (m.score ?? null) as number | null,
    year: (m.year ?? m.aired?.prop?.from?.year ?? null) as number | null,
    season: (m.season ?? null) as string | null,
    kind: (m.type ?? null) as string | null,
    status: (m.status ?? null) as string | null,
    airing: m.airing ? 1 : 0,
    broadcast_day: (m.broadcast?.day ?? null) as string | null,
    genres: genres.length ? `|${genres.join("|")}|` : "",
    start_date: (m.aired?.from ?? null) as string | null,
  };
}

/** Common MAL genres with their ids, for when even the genre list can't be fetched. */
export const FALLBACK_GENRES = [
  [1, "Action"], [2, "Adventure"], [5, "Avant Garde"], [46, "Award Winning"], [28, "Boys Love"], [4, "Comedy"],
  [8, "Drama"], [10, "Fantasy"], [26, "Girls Love"], [47, "Gourmet"], [14, "Horror"], [7, "Mystery"],
  [22, "Romance"], [24, "Sci-Fi"], [36, "Slice of Life"], [30, "Sports"], [37, "Supernatural"], [41, "Suspense"],
  [62, "Isekai"], [27, "Shounen"], [25, "Shoujo"], [42, "Seinen"], [43, "Josei"], [18, "Mecha"], [19, "Music"],
  [23, "School"], [21, "Historical"], [17, "Martial Arts"], [38, "Military"], [40, "Psychological"],
] as const;
