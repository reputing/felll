export type Format = "TV" | "TV_SHORT" | "MOVIE" | "SPECIAL" | "OVA" | "ONA" | "MUSIC";
export type Status = "FINISHED" | "RELEASING" | "NOT_YET_RELEASED" | "CANCELLED" | "HIATUS";
export type Season = "WINTER" | "SPRING" | "SUMMER" | "FALL";

/** Row returned by the search_anime RPC. */
export interface AnimeCard {
  id: number;
  slug: string;
  title_english: string | null;
  title_romaji: string;
  format: Format | null;
  status: Status | null;
  season_year: number | null;
  age_rating: string | null;
  episodes_total: number | null;
  duration_minutes: number | null;
  genres: string[];
  cover_url: string | null;
  color: string | null;
  average_score: number | null;
  popularity: number;
  sub_episodes: number;
  dub_episodes: number;
  rank: number;
  total_count: number;
}

export interface Anime {
  id: number;
  slug: string;
  anilist_id: number | null;
  mal_id: number | null;
  title_english: string | null;
  title_romaji: string;
  title_native: string | null;
  synonyms: string[];
  description: string | null;
  format: Format | null;
  status: Status | null;
  season: Season | null;
  season_year: number | null;
  country_of_origin: string | null;
  age_rating: string | null;
  episodes_total: number | null;
  duration_minutes: number | null;
  genres: string[];
  tags: string[];
  studios: string[];
  characters: string[];
  staff: string[];
  cover_url: string | null;
  banner_url: string | null;
  color: string | null;
  trailer_youtube_id: string | null;
  average_score: number | null;
  popularity: number;
  next_episode: number | null;
  next_episode_at: string | null;
  sub_episodes: number;
  dub_episodes: number;
}

export interface Episode {
  id: number;
  anime_id: number;
  number: number;
  title: string | null;
  synopsis: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  intro_start: number | null;
  intro_end: number | null;
  outro_start: number | null;
  is_filler: boolean;
}

export interface VideoSource {
  id: number;
  episode_id: number;
  provider: "cloudflare_stream" | "hls_url";
  label: string;
  audio: "sub" | "dub" | "raw";
  priority: number;
}

export interface Subtitle {
  id: number;
  episode_id: number;
  language: string;
  label: string;
  url: string;
  is_default: boolean;
}

/**
 * A unified episode as shown on the watch/anime pages. It merges episodes we
 * host ourselves (`localId` set) with episodes resolved from the Anivexa
 * aggregator by AniList ID (`localId` null). `sub`/`dub` say which audio tracks
 * are available from any source.
 */
export interface WatchEpisode {
  number: number;
  title: string | null;
  thumbnail_url: string | null;
  synopsis: string | null;
  filler: boolean;
  localId: number | null;
  intro_start: number | null;
  intro_end: number | null;
  outro_start: number | null;
  sub: boolean;
  dub: boolean;
}

/**
 * One selectable "server" in the player. Either a self-hosted source resolved
 * through `/api/play/:id`, or an Anivexa provider resolved on demand through
 * `/api/anivexa/stream/...`.
 */
export type PlayerSource = {
  key: string;
  label: string;
  audio: "sub" | "dub" | "raw";
  group: "local" | "external";
} & (
  | { kind: "local"; sourceId: number }
  | { kind: "anivexa"; provider: string; anilistId: number; episode: number }
);

export interface SearchFilters {
  q?: string;
  genres?: string[];
  tags?: string[];
  year?: number;
  season?: Season;
  format?: Format;
  status?: Status;
  origin?: string;
  audio?: "sub" | "dub" | "both";
  rating?: string;
  studio?: string;
  character?: string;
  staff?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}
