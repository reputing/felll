// Movies and series metadata with no API key: Cinemeta, the public catalog behind Stremio
// (v3-cinemeta.strem.io), with the IMDb suggestion endpoint as a second source for search.
//
// Why it is the primary catalog: TMDB needs a key someone has to create and keep, and the movies
// section sat on "coming soon" without one. Cinemeta needs nothing, answers from the edge, and its
// `meta` call hands back everything a watch page needs in one request: cast, genres, trailers, the
// IMDb id every embed server accepts, the TMDB id the others want (`moviedb_id`), and for a series
// every episode with its title, season and number.
//
// Titles are keyed by IMDb id (`tt0111161`), so a watch page is /movies/movie-tt0111161 or
// /movies/tv-tt0903747. Everything here soft-fails to empty so a bad day upstream never throws.
import { cached } from "./movie-cache";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

// CINEMETA_URL points this at another instance (or a dead address, to see how the pages behave when the catalog is down)
const BASE = (process.env.CINEMETA_URL || "https://v3-cinemeta.strem.io").replace(/\/+$/, "");
const POSTER_SMALL = "https://images.metahub.space/poster/small/";
const POSTER_MED = "https://images.metahub.space/poster/medium/";
const BACKDROP = "https://images.metahub.space/background/medium/";

export type MovieMedia = "movie" | "tv";

export interface CinemaCard {
  id: string;            // imdb id
  media: MovieMedia;
  slug: string;          // `${media}-${imdb}`
  title: string;
  poster: string | null;
  year: number | null;
  rating: string | null;
}

export interface CinemaEpisode { se: number; ep: number; title: string; overview: string; thumb: string | null; aired: string | null }

export interface CinemaDetail extends CinemaCard {
  tmdbId: number | null;
  backdrop: string | null;
  overview: string;
  genres: string[];
  cast: { name: string; character: string; image: string | null }[];
  seasons: { season: number; episodeCount: number }[];
  episodes: CinemaEpisode[];
  runtime: string | null;
  directors: string[];
  trailer: string | null; // youtube id
  isSeries: boolean;
  imdbId: string;
}

export const IMDB = /^tt\d{5,10}$/;
const typeOf = (media: MovieMedia) => (media === "tv" ? "series" : "movie");
const mediaOf = (t: unknown): MovieMedia | null => (t === "movie" ? "movie" : t === "series" ? "tv" : null);

async function getJson(path: string, timeout = 9000): Promise<Raw | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeout), redirect: "follow" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Cinemeta writes `&apos;` into names */
const clean = (s: unknown) => String(s ?? "").replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
const yearOf = (v: unknown) => {
  const m = /(\d{4})/.exec(String(v ?? ""));
  return m ? Number(m[1]) : null;
};

function toCard(m: Raw, media?: MovieMedia): CinemaCard | null {
  const id = String(m?.imdb_id ?? m?.id ?? "");
  const mm = media ?? mediaOf(m?.type);
  if (!IMDB.test(id) || !mm) return null;
  const score = Number(m.imdbRating);
  return {
    id,
    media: mm,
    slug: `${mm}-${id}`,
    title: clean(m.name) || "Untitled",
    poster: m.poster ? String(m.poster).replace("/poster/medium/", "/poster/small/") : `${POSTER_SMALL}${id}/img`,
    year: yearOf(m.releaseInfo ?? m.year),
    rating: score > 0 ? score.toFixed(1) : null,
  };
}
const cards = (metas: Raw, media?: MovieMedia): CinemaCard[] => {
  const seen = new Set<string>();
  return (Array.isArray(metas) ? metas : []).map((m: Raw) => toCard(m, media)).filter((c): c is CinemaCard => !!c && !seen.has(c.id) && !!seen.add(c.id));
};

// --- browse ----------------------------------------------------------------------------------
export const GENRES = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western"];
const PAGE = 50; // titles per Cinemeta page

/** `degraded` means the catalog source did not answer (as opposed to answering with nothing), so the page can say so */
export interface CinemaPage { items: CinemaCard[]; totalPages: number; degraded?: boolean }

/** One Cinemeta list: `top` is popularity, `imdbRating` is rating, `year` is a release year. */
async function list(media: MovieMedia, sort: "popular" | "rating" | "recent", page: number, genre?: string): Promise<{ items: CinemaCard[]; more: boolean; failed: boolean }> {
  const skip = (page - 1) * PAGE;
  const g = genre && GENRES.includes(genre) ? genre : "";
  const kind = sort === "rating" ? "imdbRating" : sort === "recent" ? "year" : "top";
  // "year" lists are keyed by release year, newest year first; the current year stands for "new"
  const extra = kind === "year" ? `genre=${new Date().getUTCFullYear()}` : g ? `genre=${encodeURIComponent(g)}` : "";
  const parts = [extra, skip ? `skip=${skip}` : ""].filter(Boolean).join("&");
  const path = `/catalog/${typeOf(media)}/${kind}${parts ? `/${parts}` : ""}.json`;
  const data = await cached(`cinema:list:${path}`, async () => {
    const d = await getJson(path);
    return d && Array.isArray(d.metas) && d.metas.length ? { metas: d.metas.slice(0, PAGE), hasMore: !!d.hasMore } : null;
  }, 3 * 3600);
  return { items: cards(data?.metas, media), more: !!data?.hasMore, failed: !data };
}

/** Search both kinds at once. Cinemeta first; IMDb's own suggestion box if Cinemeta is down or finds nothing. */
async function search(q: string, media: MovieMedia | null): Promise<{ items: CinemaCard[]; failed: boolean }> {
  const kinds: MovieMedia[] = media ? [media] : ["movie", "tv"];
  const found = await Promise.all(kinds.map(async (k) => {
    const d = await cached(`cinema:search:${k}:${q.toLowerCase()}`, async () => {
      const r = await getJson(`/catalog/${typeOf(k)}/top/search=${encodeURIComponent(q)}.json`);
      return r && Array.isArray(r.metas) ? { metas: r.metas } : null;
    }, 6 * 3600);
    return { items: cards(d?.metas, k), failed: !d };
  }));
  const down = found.every((f) => f.failed);
  // interleave so a "movies and series" search shows both kinds near the top
  const out: CinemaCard[] = [];
  for (let i = 0; i < Math.max(...found.map((f) => f.items.length), 0); i++) for (const f of found) if (f.items[i]) out.push(f.items[i]);
  if (out.length) return { items: out, failed: false };
  const fallback = await imdbSuggest(q, media);
  // nothing from either source, and the main one did not answer: that is an outage, not "no results"
  return { items: fallback, failed: down && fallback.length === 0 };
}

/** Fallback search: IMDb's suggestion endpoint (keyless, answers in a blink). */
async function imdbSuggest(q: string, media: MovieMedia | null): Promise<CinemaCard[]> {
  const key = q.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  if (!key) return [];
  try {
    const res = await fetch(`https://v3.sg.media-imdb.com/suggestion/${key[0]}/${encodeURIComponent(key)}.json`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const d = (await res.json()) as { d?: Raw[] };
    const out: CinemaCard[] = [];
    for (const r of d.d ?? []) {
      const kind: MovieMedia | null = r.qid === "movie" || r.qid === "tvMovie" ? "movie" : r.qid === "tvSeries" || r.qid === "tvMiniSeries" ? "tv" : null;
      if (!kind || !IMDB.test(String(r.id)) || (media && media !== kind)) continue;
      out.push({ id: r.id, media: kind, slug: `${kind}-${r.id}`, title: clean(r.l), poster: r.i?.imageUrl ?? `${POSTER_SMALL}${r.id}/img`, year: Number(r.y) || null, rating: null });
    }
    return out;
  } catch {
    return [];
  }
}

export async function cinemaCatalog(opts: { type?: string; sort?: string; page?: number; q?: string; genre?: string } = {}): Promise<CinemaPage> {
  const media: MovieMedia | null = opts.type === "movie" ? "movie" : opts.type === "tv" ? "tv" : null;
  const page = Math.min(20, Math.max(1, opts.page || 1));
  const q = (opts.q || "").trim().slice(0, 80);
  if (q) { const r = await search(q, media); return { items: r.items.slice(0, 48), totalPages: 1, ...(r.failed ? { degraded: true } : {}) }; }

  const sort = opts.sort === "rating" || opts.sort === "recent" ? opts.sort : "popular";
  const kinds: MovieMedia[] = media ? [media] : ["movie", "tv"];
  const lists = await Promise.all(kinds.map((k) => list(k, sort, page, opts.genre)));
  const items: CinemaCard[] = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.items.length), 0); i++) for (const l of lists) if (l.items[i]) items.push(l.items[i]);
  const more = lists.some((l) => l.more);
  return { items, totalPages: more ? Math.min(20, page + 1) : page, ...(lists.every((l) => l.failed) ? { degraded: true } : {}) };
}

/** A broad "popular now" set for the home page, movies and series mixed. */
export async function cinemaTrending(limit = 18): Promise<CinemaCard[]> {
  return (await cinemaCatalog({ sort: "popular", page: 1 })).items.slice(0, limit);
}

// --- one title -------------------------------------------------------------------------------
async function meta(media: MovieMedia, imdb: string): Promise<Raw | null> {
  if (!IMDB.test(imdb)) return null;
  const d = await cached(`cinema:meta:${media}:${imdb}`, async () => {
    const r = await getJson(`/meta/${typeOf(media)}/${imdb}.json`);
    // Cinemeta answers a series id asked as a film with some other record, so the answer has to be the title asked for
    return r?.meta?.id && String(r.meta.imdb_id ?? r.meta.id) === imdb ? r.meta : null;
  }, 12 * 3600);
  return d;
}

export async function cinemaDetail(media: MovieMedia, imdb: string): Promise<CinemaDetail | null> {
  const m = await meta(media, imdb);
  if (!m) return null;
  // the title says what it is; trust that over the address (a link that only knew the IMDb id may have guessed wrong)
  const real = mediaOf(m.type) ?? media;
  const card = toCard(m, real);
  if (!card) return null;
  media = real;
  const byEp: CinemaEpisode[] = (Array.isArray(m.videos) ? m.videos : [])
    .filter((v: Raw) => Number(v?.season) >= 1 && Number(v?.episode ?? v?.number) >= 1)
    .map((v: Raw) => ({
      se: Number(v.season),
      ep: Number(v.episode ?? v.number),
      title: clean(v.name || v.title) || `Episode ${v.episode ?? v.number}`,
      overview: clean(v.overview ?? v.description),
      thumb: v.thumbnail ?? null,
      aired: v.released ?? v.firstAired ?? null,
    }))
    // an episode that has not aired yet cannot be played; keep it listed but the page only offers aired ones first
    .sort((a: CinemaEpisode, b: CinemaEpisode) => a.se - b.se || a.ep - b.ep);
  const seasonMap = new Map<number, number>();
  for (const e of byEp) seasonMap.set(e.se, (seasonMap.get(e.se) ?? 0) + 1);
  const trailer = (Array.isArray(m.trailerStreams) ? m.trailerStreams[0]?.ytId : null) ?? (Array.isArray(m.trailers) ? m.trailers[0]?.source : null) ?? null;
  return {
    ...card,
    poster: `${POSTER_MED}${card.id}/img`,
    tmdbId: Number(m.moviedb_id) > 0 ? Number(m.moviedb_id) : null,
    backdrop: m.background ? String(m.background) : `${BACKDROP}${card.id}/img`,
    overview: clean(m.description),
    genres: (Array.isArray(m.genres) ? m.genres : Array.isArray(m.genre) ? m.genre : []).map(clean).filter(Boolean),
    cast: (Array.isArray(m.cast) ? m.cast : []).slice(0, 12).map((n: unknown) => ({ name: clean(n), character: "", image: null })),
    seasons: [...seasonMap].map(([season, episodeCount]) => ({ season, episodeCount })),
    episodes: byEp,
    runtime: m.runtime ? clean(m.runtime) : null,
    directors: (Array.isArray(m.director) ? m.director : []).map(clean).filter(Boolean).slice(0, 4),
    trailer: typeof trailer === "string" ? trailer : null,
    isSeries: media === "tv",
    imdbId: card.id,
  };
}

/** Health probe for the catalog source (for /api/health). */
export async function cinemaPing(): Promise<{ ok: boolean; ms: number }> {
  const t = Date.now();
  const d = await getJson("/manifest.json", 6000);
  return { ok: !!d?.catalogs, ms: Date.now() - t };
}

export async function cinemaEpisodes(imdb: string, season: number): Promise<CinemaEpisode[]> {
  const d = await cinemaDetail("tv", imdb);
  return d ? d.episodes.filter((e) => e.se === season) : [];
}
