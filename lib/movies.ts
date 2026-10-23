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
export interface MovieSource { res: string; url: string; format: string; proxy?: string }
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

// Pull cards out of any Moviebox shape: {items}, {data}, {results}, a bare
// array, or the home feed's {sections:[{items}]}.
function extractCards(data: Raw): MovieCard[] {
  if (!data) return [];
  let arr: Raw[] = [];
  if (Array.isArray(data)) arr = data;
  else if (Array.isArray(data.items)) arr = data.items;
  else if (Array.isArray(data.data)) arr = data.data;
  else if (Array.isArray(data.results)) arr = data.results;
  else if (Array.isArray(data.sections)) arr = data.sections.flatMap((s: Raw) => s.items ?? []);
  // de-dupe by subject id (home sections overlap)
  const seen = new Set<string>();
  return arr.map(toCard).filter((c: MovieCard) => c.id && c.slug && !seen.has(c.id) && seen.add(c.id));
}

const HOME_FALLBACK: Record<string, string> = { movie: "/movies", tv: "/tv-series", anime: "/animation", all: "/home/all" };

/** Browse titles. Uses the indexed /catalog when it's populated, and falls back
 *  to the live home-section + search endpoints when it isn't (so this works even
 *  on an ephemeral host with no persistent catalog). */
export async function movieCatalog(opts: { type?: string; sort?: string; page?: number; q?: string } = {}): Promise<MoviePage> {
  const type = ["movie", "tv", "anime"].includes(opts.type || "") ? (opts.type as string) : "all";
  const sort = ["recent", "title", "rating"].includes(opts.sort || "") ? opts.sort : "recent";
  const page = Math.max(1, opts.page || 1);
  const q = (opts.q || "").trim();

  if (q) {
    const primary = extractCards(await getJson(`/catalog?type=${type}&sort=${sort}&page=${page}&per_page=24&q=${encodeURIComponent(q)}`));
    if (primary.length) return { items: primary, totalPages: 1 };
    return { items: extractCards(await getJson(`/search?q=${encodeURIComponent(q)}`)), totalPages: 1 }; // live fallback
  }

  // Only cache a /catalog page that actually has rows, so an empty index (cold
  // container) doesn't get pinned for 6h — it retries until the walk populates.
  const data = await cached(`movie:catalog:${type}:${sort}:${page}`, async () => {
    const d = await getJson(`/catalog?type=${type}&sort=${sort}&page=${page}&per_page=24`);
    return d && (d.items?.length ?? 0) > 0 ? d : null;
  });
  const items = extractCards(data);
  if (items.length) return { items, totalPages: data?.total_pages ?? 1 };

  // live fallback: the home-section catalogs
  const live = await cached(`movie:home:${type}`, () => getJson(HOME_FALLBACK[type] ?? "/home/all"));
  return { items: extractCards(live), totalPages: 1 };
}

/** A broad "popular now" set for the homepage, mixing movies and series. */
export async function trendingTitles(limit = 18): Promise<MovieCard[]> {
  const indexed = extractCards(await cached("movie:trending", async () => {
    const d = await getJson("/catalog?sort=rating&page=1&per_page=24");
    return d && (d.items?.length ?? 0) > 0 ? d : null;
  }));
  if (indexed.length) return indexed.slice(0, limit);
  const live = extractCards(await cached("movie:home", () => getJson("/home"))); // live fallback
  return live.slice(0, limit);
}

const pick = (...vals: Raw[]): Raw => vals.find((v) => v != null && v !== "");

export async function movieDetail(slug: string): Promise<MovieDetail | null> {
  if (!slug) return null;
  const data = await cached(`movie:detail:${slug}`, () => getJson(`/detail/${encodeURIComponent(slug)}`));
  if (!data) return null;
  // Moviebox nests the subject differently across endpoints; dig for it.
  const d = data.data ?? data;
  const subj = d.subject ?? d.detail ?? d;
  const subjectId = String(pick(d.subject_id, d.subjectId, subj.subject_id, subj.subjectId, subj.id, d.id) ?? "");
  const title = pick(subj.name, subj.title, d.name, d.title, subj.subjectTitle) ?? "Untitled";
  const poster = pick(subj.poster_url, subj.cover, subj.poster, subj.image, subj.coverVerticalUrl, d.poster_url, d.cover) ?? null;
  const rawSeasons = subj.seasons ?? d.seasons ?? subj.resource?.seasons ?? [];
  const seasons: MovieDetail["seasons"] = (rawSeasons as Raw[]).map((s: Raw, i: number) => ({
    season: s.season ?? s.se ?? s.seasonNum ?? i + 1,
    episodes: (s.episodes ?? s.eps ?? []).map((e: Raw, j: number) => ({ se: s.season ?? i + 1, ep: e.ep ?? e.episode ?? e.episodeNum ?? j + 1, title: pick(e.name, e.title) ?? `Episode ${e.ep ?? j + 1}` })),
  }));
  const genreRaw = subj.genre ?? d.genre ?? subj.genres ?? d.genres ?? [];
  const type = classify({ ...subj, subject_type: pick(subj.subject_type, subj.subjectType, d.subject_type) });
  return {
    id: subjectId,
    slug,
    title,
    poster,
    year: pick(subj.year, d.year) ?? null,
    rating: pick(subj.rating, subj.imdbRatingValue, d.rating) != null ? String(pick(subj.rating, subj.imdbRatingValue, d.rating)) : null,
    badge: subj.badge ?? null,
    type,
    overview: pick(subj.description, subj.overview, subj.synopsis, d.description, d.overview) ?? "",
    genres: Array.isArray(genreRaw) ? genreRaw.map((g: Raw) => (typeof g === "string" ? g : g?.name)).filter(Boolean) : String(genreRaw).split(",").map((s) => s.trim()).filter(Boolean),
    cast: (subj.cast ?? subj.actors ?? d.cast ?? []).slice(0, 12).map((c: Raw) => ({ name: c.name ?? c.staffName ?? "", character: c.character ?? c.role ?? "", image: c.image ?? c.avatar ?? c.avatarUrl ?? null })),
    seasons,
    isSeries: seasons.length > 0 || type === "tv",
  };
}

/** Resolve playable sources for a movie, or one episode of a series. */
export async function movieStream(subjectId: string, slug: string, se?: number, ep?: number): Promise<MovieStream | null> {
  if (!subjectId) return null;
  const b = await base();
  const q = `detail_path=${encodeURIComponent(slug)}${se ? `&se=${se}` : ""}${ep ? `&ep=${ep}` : ""}`;
  const raw = await getJson(`/api/stream/${encodeURIComponent(subjectId)}?${q}`);
  const data = raw?.data ?? raw;
  if (!data || (!data.has_resource && !data.sources?.length && !data.hls?.length && !data.streams?.length)) return null;
  // The Moviebox stream CDN gates on the Referer header: it accepts its own
  // player's referer (or none) and 403s a foreign one. So each MP4 gets two
  // playable URLs, tried in order by the player:
  //   1. `url`   — the signed CDN URL, played direct. The watch page sets a
  //                `no-referrer` policy so the browser sends NO Referer (not
  //                cupcake.gg's), and the request rides the viewer's own
  //                connection — the CDN's happy path.
  //   2. `proxy` — the backend's /proxy, which re-fetches the stream server
  //                side WITH the real moviebox.ph Referer. Fallback for when
  //                the CDN insists on a referer rather than allowing an empty
  //                one.
  const RES = (r: string) => Number((r.match(/(\d{3,4})/) || [])[1]) || 0;
  const proxyUrl = (res: string) =>
    b ? `${b}/api/stream/${encodeURIComponent(subjectId)}/proxy?detail_path=${encodeURIComponent(slug)}&res=${encodeURIComponent(res)}${se ? `&se=${se}` : ""}${ep ? `&ep=${ep}` : ""}` : undefined;
  const sources: MovieSource[] = [];
  for (const s of [...(data.sources ?? []), ...(data.streams ?? [])] as Raw[]) {
    const url = s?.url ?? s?.src;
    if (!url || sources.some((x) => x.url === url)) continue;
    const res = String(s.resolution ?? s.res ?? s.quality ?? s.label ?? "Auto");
    sources.push({ res, url: String(url), format: "mp4", proxy: proxyUrl(res) });
  }
  sources.sort((a, b2) => RES(b2.res) - RES(a.res));
  // HLS manifests also play direct.
  for (const h of data.hls ?? []) if (h?.url || typeof h === "string") sources.push({ res: "HLS", url: String(h.url ?? h), format: "hls" });
  const subtitles = (data.captions ?? data.subtitles ?? [])
    .filter((s: Raw) => s?.url || s?.lang)
    .map((s: Raw) => ({ lang: s.lang ?? s.language ?? "en", label: s.label ?? s.name ?? (s.lang ?? "Subtitles"), url: s.url ?? "" }))
    .filter((s: { url: string }) => s.url);
  return { sources, subtitles };
}
