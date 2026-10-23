// Movies & series, from a self-hosted Moviebox-API instance (the same pattern as
// Anivexa): point MOVIEBOX_API_URL at the deployed service and this lights up;
// leave it unset and every call soft-fails to empty, so nothing breaks.
//
// Upstream (github.com/faisaljs/Moviebox-API) exposes a clean REST surface:
//   GET /catalog?type=&sort=&page=&per_page=&q=  → { items[], total_pages }
//   GET /home                                     → { sections[] }
//   GET /detail/{slug}                            → full metadata tree
//   GET /api/stream/{subject_id}?detail_path=&se=&ep= → { sources[], hls[], ... }
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { background, db, now } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

export interface MovieCard {
  id: string;        // subject_id
  slug: string;      // detail_path
  title: string;
  poster: string | null;
  year: number | null;
  rating: string | null;
  badge: string | null;
  type: "movie" | "tv" | "anime" | "other";
}
export interface MovieSource { res: string; url: string; format: string }
export interface MovieStream { sources: MovieSource[]; subtitles: { lang: string; label: string; url: string }[] }
export interface MovieEpisode { se: number; ep: number; title: string }
export interface MovieDetail extends MovieCard {
  overview: string;
  genres: string[];
  cast: { name: string; character: string; image: string | null }[];
  seasons: { season: number; episodes: MovieEpisode[] }[];
  isSeries: boolean;
}

async function base(): Promise<string | null> {
  let url: string | undefined;
  try {
    const env = (await getCloudflareContext({ async: true })).env as unknown as { MOVIEBOX_API_URL?: string };
    url = env?.MOVIEBOX_API_URL;
  } catch { /* not in a request context */ }
  if (!url) url = process.env.MOVIEBOX_API_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

export async function moviesEnabled(): Promise<boolean> {
  return (await base()) !== null;
}

async function getJson(path: string, timeout = 15_000): Promise<Raw | null> {
  const b = await base();
  if (!b) return null;
  try {
    const res = await fetch(`${b}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

const TYPE: Record<string, MovieCard["type"]> = { "1": "movie", "2": "tv", "6": "other", movie: "movie", tv: "tv", series: "tv", anime: "anime" };
function classify(m: Raw): MovieCard["type"] {
  const g = String(m?.genre ?? "").toLowerCase();
  if (g.includes("anime")) return "anime";
  return TYPE[String(m?.subject_type ?? m?.subject_type_name ?? "")] ?? (Array.isArray(m?.types) && m.types.includes("tv") ? "tv" : "movie");
}
function toCard(m: Raw): MovieCard {
  return {
    id: String(m.subject_id ?? m.id ?? ""),
    slug: String(m.slug ?? m.detail_path ?? ""),
    title: m.name ?? m.title ?? "Untitled",
    poster: m.poster_url ?? m.poster ?? null,
    year: m.year ?? null,
    rating: m.rating != null ? String(m.rating) : null,
    badge: m.badge ?? null,
    type: classify(m),
  };
}

// --- D1 cache (shared across viewers, background refresh) -------------------
const TTL = 6 * 3600;
async function cached<T>(key: string, build: () => Promise<T | null>, ttl = TTL): Promise<T | null> {
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

// --- queries ---------------------------------------------------------------

export interface MoviePage { items: MovieCard[]; totalPages: number }

/** Browse the indexed catalog. type: all|movie|tv|anime. */
export async function movieCatalog(opts: { type?: string; sort?: string; page?: number; q?: string } = {}): Promise<MoviePage> {
  const type = ["movie", "tv", "anime"].includes(opts.type || "") ? opts.type : "all";
  const sort = ["recent", "title", "rating"].includes(opts.sort || "") ? opts.sort : "recent";
  const page = Math.max(1, opts.page || 1);
  const q = (opts.q || "").trim();
  const qs = `type=${type}&sort=${sort}&page=${page}&per_page=24${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  // Searches aren't cached (too many); browse pages are.
  const data = q ? await getJson(`/catalog?${qs}`) : await cached(`movie:catalog:${type}:${sort}:${page}`, () => getJson(`/catalog?${qs}`));
  if (!data) return { items: [], totalPages: 0 };
  return { items: (data.items ?? []).map(toCard).filter((c: MovieCard) => c.id && c.slug), totalPages: data.total_pages ?? 1 };
}

/** A broad "popular now" set for the homepage, mixing movies and series. */
export async function trendingTitles(limit = 18): Promise<MovieCard[]> {
  const data = await cached("movie:trending", () => getJson("/catalog?sort=rating&page=1&per_page=24"));
  return (data?.items ?? []).map(toCard).filter((c: MovieCard) => c.id && c.slug).slice(0, limit);
}

export async function movieDetail(slug: string): Promise<MovieDetail | null> {
  if (!slug) return null;
  const data = await cached(`movie:detail:${slug}`, () => getJson(`/detail/${encodeURIComponent(slug)}`));
  const d = data?.data ?? data;
  if (!d) return null;
  const seasons: MovieDetail["seasons"] = (d.seasons ?? []).map((s: Raw, i: number) => ({
    season: s.season ?? s.se ?? i + 1,
    episodes: (s.episodes ?? []).map((e: Raw, j: number) => ({ se: s.season ?? i + 1, ep: e.ep ?? e.episode ?? j + 1, title: e.name ?? e.title ?? `Episode ${e.ep ?? j + 1}` })),
  }));
  const card = toCard({ ...d, subject_id: d.subject_id ?? d.id, slug });
  return {
    ...card,
    overview: d.description ?? d.overview ?? "",
    genres: Array.isArray(d.genre) ? d.genre : (d.genres ?? []),
    cast: (d.cast ?? d.actors ?? []).slice(0, 12).map((c: Raw) => ({ name: c.name ?? "", character: c.character ?? c.role ?? "", image: c.image ?? c.avatar ?? null })),
    seasons,
    isSeries: seasons.length > 0 || card.type === "tv",
  };
}

/** Resolve playable sources for a movie, or one episode of a series. */
export async function movieStream(subjectId: string, slug: string, se?: number, ep?: number): Promise<MovieStream | null> {
  if (!subjectId) return null;
  const q = `detail_path=${encodeURIComponent(slug)}${se ? `&se=${se}` : ""}${ep ? `&ep=${ep}` : ""}`;
  const data = await getJson(`/api/stream/${encodeURIComponent(subjectId)}?${q}`);
  if (!data?.has_resource && !data?.sources?.length && !data?.hls?.length) return null;
  const sources: MovieSource[] = (data.sources ?? [])
    .filter((s: Raw) => s?.url)
    .map((s: Raw) => ({ res: String(s.resolution ?? s.res ?? "auto"), url: String(s.url), format: String(s.format ?? "mp4") }));
  // HLS manifests, if any, as a last entry
  for (const h of data.hls ?? []) if (h?.url || typeof h === "string") sources.push({ res: "HLS", url: String(h.url ?? h), format: "hls" });
  const subtitles = (data.captions ?? data.subtitles ?? [])
    .filter((s: Raw) => s?.url || s?.lang)
    .map((s: Raw) => ({ lang: s.lang ?? s.language ?? "en", label: s.label ?? s.name ?? (s.lang ?? "Subtitles"), url: s.url ?? "" }))
    .filter((s: { url: string }) => s.url);
  return { sources, subtitles };
}
