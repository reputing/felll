// The movies & series layer, built on TMDB (The Movie Database) for the catalog
// — browse, search, detail, cast, seasons — and for the ids every player needs:
//   • 8Stream (lib/stream8.ts) plays a movie's HLS stream, keyed by IMDB id.
//   • The embed servers below play movies and TV, keyed by TMDB id.
//
// Lights up only when TMDB_API_KEY (a v3 key) is set; otherwise every call
// soft-fails to empty and the /movies section shows its "coming soon" state.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { background, db, now } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

const IMG = "https://image.tmdb.org/t/p/w500";
const CARD = "https://image.tmdb.org/t/p/w342"; // grid thumbnails; smaller than the detail poster
const BACKDROP = "https://image.tmdb.org/t/p/w1280";
const PROFILE = "https://image.tmdb.org/t/p/w185";

export type MovieMedia = "movie" | "tv";

export interface MovieCard {
  id: number;            // TMDB id
  media: MovieMedia;
  slug: string;          // `${media}-${id}`, the /movies/[slug] route key
  title: string;
  poster: string | null;
  year: number | null;
  rating: string | null;
}
export interface MovieSource { label: string; url: string; format: "hls" | "mp4" }
export interface MovieStream { sources: MovieSource[]; subtitles: { lang: string; label: string; url: string }[] }
export interface MovieEmbed { name: string; url: string }
export interface MovieEpisode { se: number; ep: number; title: string }
export interface MovieDetail {
  id: number;
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

/** Whether the movies section is usable (the catalog needs a TMDB key). */
export async function moviesEnabled(): Promise<boolean> {
  return (await apiKey()) !== null;
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
export async function movieCatalog(opts: { type?: string; sort?: string; page?: number; q?: string } = {}): Promise<MoviePage> {
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
export async function movieDetail(media: MovieMedia, id: number): Promise<MovieDetail | null> {
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
  };
}

/** Episodes of one season of a series. */
export async function movieSeasonEpisodes(id: number, season: number): Promise<MovieEpisode[]> {
  if (!Number.isInteger(id) || !Number.isInteger(season)) return [];
  const data = await cached(`tmdb:season:${id}:${season}`, () => tmdbGet(`/tv/${id}/season/${season}`), 2 * 86400);
  return (Array.isArray(data?.episodes) ? data.episodes : []).map((e: Raw) => ({
    se: season,
    ep: Number(e.episode_number),
    title: e.name || `Episode ${e.episode_number}`,
  }));
}

// --- Embed players ---------------------------------------------------------
// Each is keyed by TMDB id; patterns differ per host. VidCore's base is
// overridable (VIDCORE_EMBED_BASE) since the exact host moves. Embed hosts come
// and go, so each is offered as a separate "server" the viewer can switch to.
async function providers(): Promise<{ name: string; movie: (id: number) => string; tv: (id: number, s: number, e: number) => string }[]> {
  const e = await env();
  const vidcore = (e.VIDCORE_EMBED_BASE || process.env.VIDCORE_EMBED_BASE || "https://vidcore.org").replace(/\/+$/, "");
  return [
    { name: "VidSrc", movie: (id) => `https://vidsrc.xyz/embed/movie/${id}`, tv: (id, s, ep) => `https://vidsrc.xyz/embed/tv/${id}/${s}/${ep}` },
    { name: "VidLink", movie: (id) => `https://vidlink.pro/movie/${id}`, tv: (id, s, ep) => `https://vidlink.pro/tv/${id}/${s}/${ep}` },
    { name: "2Embed", movie: (id) => `https://www.2embed.cc/embed/${id}`, tv: (id, s, ep) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${ep}` },
    { name: "VidCore", movie: (id) => `${vidcore}/embed/movie/${id}`, tv: (id, s, ep) => `${vidcore}/embed/tv/${id}/${s}/${ep}` },
  ];
}

/** Embed players for a title (one per provider), keyed by its TMDB id. */
export async function movieEmbeds(media: MovieMedia, tmdbId: number, se?: number, ep?: number): Promise<MovieEmbed[]> {
  if (!Number.isInteger(tmdbId)) return [];
  const list = await providers();
  return list.map((p) => ({ name: p.name, url: media === "tv" ? p.tv(tmdbId, se || 1, ep || 1) : p.movie(tmdbId) }));
}
