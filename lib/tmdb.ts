// The movies & series layer: what the /movies pages and the home rail call.
//
// The catalog and every title's details come from Cinemeta with no key (lib/cinema.ts), so the section is always on.
// TMDB is the second source: when TMDB_API_KEY (a v3 key) is set it covers a Cinemeta outage and still serves the old
// numeric links (/movies/movie-278). Playing is a separate matter (lib/movie-servers.ts for the embed servers,
// /api/movie/stream for the direct ones), keyed by the ids a title carries.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { background, db, now } from "./db";
import { cinemaCatalog, cinemaDetail, cinemaEpisodes, cinemaTrending, IMDB, GENRES } from "./cinema";
import { liveEmbeds, type MovieEmbed as Embed, type TitleIds } from "./movie-servers";

export { GENRES };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

const IMG = "https://image.tmdb.org/t/p/w500";
const CARD = "https://image.tmdb.org/t/p/w342"; // grid thumbnails; smaller than the detail poster
const BACKDROP = "https://image.tmdb.org/t/p/w1280";
const PROFILE = "https://image.tmdb.org/t/p/w185";

export type MovieMedia = "movie" | "tv";

export interface MovieCard {
  id: number | string;   // IMDb id (tt...) from Cinemeta, or a TMDB id
  media: MovieMedia;
  slug: string;          // `${media}-${id}`, the /movies/[slug] route key
  title: string;
  poster: string | null;
  year: number | null;
  rating: string | null;
}
export interface MovieSource { label: string; url: string; format: "hls" | "mp4"; /** same-origin fallback for a CDN that is fussy about who asks */ proxy?: string }
export interface MovieStream { sources: MovieSource[]; subtitles: { lang: string; label: string; url: string }[] }
export type MovieEmbed = Embed;
export interface MovieEpisode { se: number; ep: number; title: string; overview?: string; thumb?: string | null; aired?: string | null }
export interface MovieDetail {
  id: number | string;
  media: MovieMedia;
  slug: string;
  title: string;
  poster: string | null;
  backdrop: string | null;
  year: number | null;
  rating: string | null;
  overview: string;
  genres: string[];
  cast: { name: string; character: string; image: string | null }[];
  seasons: { season: number; episodeCount: number }[];
  isSeries: boolean;
  imdbId: string | null;
  tmdbId: number | null;
  runtime?: string | null;
  directors?: string[];
  /** every episode of a series, with air dates (keyless catalog only) */
  episodes?: MovieEpisode[];
  trailer?: string | null;
}
export interface MoviePage { items: MovieCard[]; totalPages: number }

async function env(): Promise<Record<string, string | undefined>> {
  try {
    return (await getCloudflareContext({ async: true })).env as unknown as Record<string, string | undefined>;
  } catch {
    return process.env as Record<string, string | undefined>;
  }
}

async function apiKey(): Promise<string | null> {
  const e = await env();
  return e.TMDB_API_KEY || process.env.TMDB_API_KEY || null;
}

/** The movies section is always on: Cinemeta needs no key. */
export async function moviesEnabled(): Promise<boolean> {
  return true;
}

/** Health probe: is TMDB configured and answering? (for /api/health) */
export async function tmdbPing(): Promise<{ configured: boolean; ok: boolean; ms: number }> {
  const configured = (await apiKey()) !== null;
  if (!configured) return { configured: false, ok: false, ms: 0 };
  const t = Date.now();
  const ok = (await tmdbGet("/configuration", 6000)) != null;
  return { configured: true, ok, ms: Date.now() - t };
}

// --- TMDB fetch ------------------------------------------------------------
async function tmdbGet(path: string, timeout = 12_000): Promise<Raw | null> {
  const key = await apiKey();
  if (!key) return null;
  const url = `https://api.themoviedb.org/3${path}${path.includes("?") ? "&" : "?"}api_key=${key}`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// --- D1 cache (shared across viewers, background refresh) -------------------
async function cached<T>(key: string, build: () => Promise<T | null>, ttl = 6 * 3600): Promise<T | null> {
  let row: { body: string; fetched_at: number } | null = null;
  try { row = await (await db()).prepare("select body, fetched_at from jikan_cache where key = ?").bind(key).first(); } catch { /* no db */ }
  if (row) {
    if (now() - row.fetched_at >= ttl) background(refresh(key, build));
    try { return JSON.parse(row.body) as T; } catch { /* fall through */ }
  }
  return refresh(key, build);
}
async function refresh<T>(key: string, build: () => Promise<T | null>): Promise<T | null> {
  const data = await build();
  if (data != null) {
    try {
      await (await db())
        .prepare("insert into jikan_cache (key, body, fetched_at) values (?, ?, ?) on conflict(key) do update set body = excluded.body, fetched_at = excluded.fetched_at")
        .bind(key, JSON.stringify(data), now()).run();
    } catch { /* best effort */ }
  }
  return data;
}

// --- parsers ---------------------------------------------------------------
function card(m: Raw, media?: MovieMedia): MovieCard | null {
  const mt = (media ?? m?.media_type) as string;
  if (mt !== "movie" && mt !== "tv") return null;
  const mm = mt as MovieMedia;
  const id = Number(m?.id);
  if (!Number.isInteger(id)) return null;
  const date = String(m.release_date ?? m.first_air_date ?? "");
  const score = Number(m.vote_average);
  return {
    id,
    media: mm,
    slug: `${mm}-${id}`,
    title: m.title ?? m.name ?? "Untitled",
    poster: m.poster_path ? CARD + m.poster_path : null,
    year: date ? Number(date.slice(0, 4)) || null : null,
    rating: score ? score.toFixed(1) : null,
  };
}
const cards = (results: Raw): MovieCard[] => (Array.isArray(results) ? results.map((r: Raw) => card(r)).filter((c): c is MovieCard => c != null) : []);

// --- queries ---------------------------------------------------------------

/** A broad "popular now" set for the homepage, mixing movies and series. */
export async function tmdbTrending(limit = 18): Promise<MovieCard[]> {
  const fromCinema = await cinemaTrending(limit);
  if (fromCinema.length) return fromCinema;
  const data = await cached("tmdb:trending", () => tmdbGet("/trending/all/week"));
  return cards(data?.results).slice(0, limit);
}

const SORT: Record<string, { movie: string; tv: string }> = {
  recent: { movie: "primary_release_date.desc", tv: "first_air_date.desc" },
  rating: { movie: "vote_average.desc", tv: "vote_average.desc" },
  popular: { movie: "popularity.desc", tv: "popularity.desc" },
};

/** Browse / search titles. Search spans movies + TV; browse uses /discover with
 *  the chosen sort, or /trending for the "all" tab. */
export async function movieCatalog(opts: { type?: string; sort?: string; page?: number; q?: string; genre?: string } = {}): Promise<MoviePage> {
  const fromCinema = await cinemaCatalog(opts);
  if (fromCinema.items.length || !(await apiKey())) return fromCinema;
  const media: MovieMedia | null = opts.type === "movie" ? "movie" : opts.type === "tv" ? "tv" : null;
  const sort = SORT[opts.sort ?? ""] ? opts.sort! : "popular";
  const page = Math.min(500, Math.max(1, opts.page || 1));
  const q = (opts.q || "").trim();

  if (q) {
    const data = await tmdbGet(`/search/multi?query=${encodeURIComponent(q)}&page=${page}&include_adult=false`);
    return { items: cards(data?.results), totalPages: Math.min(500, data?.total_pages ?? 1) };
  }

  if (media) {
    const sortBy = SORT[sort][media];
    const gate = sort === "rating" ? "&vote_count.gte=200" : "";
    const data = await cached(`tmdb:discover:${media}:${sort}:${page}`, () =>
      tmdbGet(`/discover/${media}?sort_by=${sortBy}&page=${page}&include_adult=false${gate}`));
    return { items: (Array.isArray(data?.results) ? data.results.map((r: Raw) => card(r, media)).filter((c: MovieCard | null): c is MovieCard => c != null) : []), totalPages: Math.min(500, data?.total_pages ?? 1) };
  }

  const data = await cached(`tmdb:trending:all:${page}`, () => tmdbGet(`/trending/all/week?page=${page}`));
  return { items: cards(data?.results), totalPages: Math.min(500, data?.total_pages ?? 1) };
}

/** Full detail for a title (cast, genres, seasons, and the IMDB id for 8Stream). */
export async function movieDetail(media: MovieMedia, id: number | string): Promise<MovieDetail | null> {
  if (typeof id === "string" && IMDB.test(id)) {
    const d = await cinemaDetail(media, id);
    return d ? { ...d, id: d.id } : null;
  }
  id = Number(id);
  if ((media !== "movie" && media !== "tv") || !Number.isInteger(id)) return null;
  const data = await cached(`tmdb:detail:${media}:${id}`, () => tmdbGet(`/${media}/${id}?append_to_response=credits,external_ids`), 7 * 86400);
  if (!data?.id) return null;
  const date = String(data.release_date ?? data.first_air_date ?? "");
  const score = Number(data.vote_average);
  const seasons = (Array.isArray(data.seasons) ? data.seasons : [])
    .filter((s: Raw) => Number(s?.season_number) >= 1 && Number(s?.episode_count) > 0)
    .map((s: Raw) => ({ season: Number(s.season_number), episodeCount: Number(s.episode_count) }));
  return {
    id: Number(data.id),
    media,
    slug: `${media}-${data.id}`,
    title: data.title ?? data.name ?? "Untitled",
    poster: data.poster_path ? IMG + data.poster_path : null,
    backdrop: data.backdrop_path ? BACKDROP + data.backdrop_path : null,
    year: date ? Number(date.slice(0, 4)) || null : null,
    rating: score ? score.toFixed(1) : null,
    overview: data.overview ?? "",
    genres: Array.isArray(data.genres) ? data.genres.map((g: Raw) => g?.name).filter(Boolean) : [],
    cast: (data.credits?.cast ?? []).slice(0, 12).map((c: Raw) => ({ name: c.name ?? "", character: c.character ?? "", image: c.profile_path ? PROFILE + c.profile_path : null })),
    seasons,
    isSeries: media === "tv",
    imdbId: data.external_ids?.imdb_id ?? data.imdb_id ?? null,
    tmdbId: Number(data.id),
  };
}

/** Episodes of one season of a series. */
export async function movieSeasonEpisodes(id: number | string, season: number): Promise<MovieEpisode[]> {
  if (typeof id === "string" && IMDB.test(id)) return cinemaEpisodes(id, season);
  if (typeof id !== "number" || !Number.isInteger(id) || !Number.isInteger(season)) return [];
  const data = await cached(`tmdb:season:${id}:${season}`, () => tmdbGet(`/tv/${id}/season/${season}`), 2 * 86400);
  return (Array.isArray(data?.episodes) ? data.episodes : []).map((e: Raw) => ({
    se: season,
    ep: Number(e.episode_number),
    title: e.name || `Episode ${e.episode_number}`,
  }));
}

// --- Embed players ---------------------------------------------------------------------------------
/** Embed players for a title, one per live server, keyed by whichever ids it has (lib/movie-servers). */
export async function movieEmbeds(media: MovieMedia, ids: TitleIds, se?: number, ep?: number): Promise<MovieEmbed[]> {
  if (!ids.imdb && !ids.tmdb) return [];
  return liveEmbeds(media, ids, se || 1, ep || 1);
}

// --- story map ---------------------------------------------------------------------------------
// Where this title sits in its story. A film: the collection it belongs to, in release order
// (TMDB has no in-universe chronology, so release order is the honest one). A series: its seasons,
// with years and episode counts, and the specials that sit beside them.
export interface StoryMap {
  kind: "collection" | "seasons";
  name: string;
  items: { id: number; slug: string | null; title: string; year: number | null; poster: string | null; note: string; season?: number }[];
}

export async function movieStoryMap(media: MovieMedia, id: number | string): Promise<StoryMap | null> {
  if (typeof id === "string") {
    // keyless titles: a series shows its seasons (there is no collection data for a film)
    if (media !== "tv" || !IMDB.test(id)) return null;
    const d = await cinemaDetail("tv", id);
    if (!d || d.seasons.length < 2) return null;
    return { kind: "seasons", name: d.title, items: d.seasons.map((x) => ({ id: x.season, slug: null, title: `Season ${x.season}`, year: null, poster: null, note: `${x.episodeCount} episode${x.episodeCount === 1 ? "" : "s"}`, season: x.season })) };
  }
  if ((media !== "movie" && media !== "tv") || !Number.isInteger(id)) return null;
  const data = await cached(`tmdb:detail:${media}:${id}`, () => tmdbGet(`/${media}/${id}?append_to_response=credits,external_ids`), 7 * 86400);
  if (!data?.id) return null;
  if (media === "tv") {
    const seasons: Raw[] = Array.isArray(data.seasons) ? data.seasons : [];
    const items = seasons.filter((s) => Number(s?.episode_count) > 0).map((s) => {
      const n = Number(s.season_number);
      const year = Number(String(s.air_date ?? "").slice(0, 4)) || null;
      return { id: Number(s.id) || n, slug: null, title: n === 0 ? "Specials" : s.name || `Season ${n}`, year, poster: s.poster_path ? CARD + s.poster_path : null, note: `${s.episode_count} episode${s.episode_count === 1 ? "" : "s"}`, season: n };
    });
    return items.length > 1 ? { kind: "seasons", name: data.name ?? "", items } : null;
  }
  const colId = Number(data.belongs_to_collection?.id);
  if (!Number.isInteger(colId)) return null;
  const col = await cached(`tmdb:collection:${colId}`, () => tmdbGet(`/collection/${colId}`), 7 * 86400);
  const parts: Raw[] = Array.isArray(col?.parts) ? col.parts : [];
  const items = parts
    .filter((p) => p?.id)
    .sort((a, b) => String(a.release_date || "9999").localeCompare(String(b.release_date || "9999")))
    .map((p) => ({ id: Number(p.id), slug: `movie-${p.id}`, title: p.title ?? "Untitled", year: Number(String(p.release_date ?? "").slice(0, 4)) || null, poster: p.poster_path ? CARD + p.poster_path : null, note: p.release_date ? "" : "unreleased" }));
  return items.length > 1 ? { kind: "collection", name: col?.name ?? data.belongs_to_collection?.name ?? "Collection", items } : null;
}
