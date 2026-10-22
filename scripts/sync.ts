// Fills D1 with the catalog, from outside Cloudflare.
//
// Jikan (MyAnimeList) refuses Cloudflare's shared Worker IPs, so the site can't
// call it live — and it, like AniList's public API, goes down for stretches.
// This runs anywhere else (your PC, a GitHub Action) and pulls the same catalog
// from whichever upstream is healthy, reshaping every title into the exact Jikan
// JSON the site already reads, keyed by its MyAnimeList id:
//
//   * AniList (GraphQL) is preferred — it carries idMal and is what the Anivexa
//     bot keys on.
//   * Kitsu (REST) is the fallback — it carries the MAL id too (via mappings)
//     and stays up when AniList doesn't.
//
// Whichever answers, the Worker and every page are unchanged; only the origin of
// the data moves. Jikan is never called.
//
//   npm run sync                 # the usual: ~1500 titles
//   npm run sync -- --quick      # faster: lists + ~300 titles
//   npm run sync -- --local      # into the local dev database instead
//   npm run sync -- --source kitsu   # force a source (anilist | kitsu)
//   npm run sync -- --pages 2000     # target this many titles
//
// It writes the same two things it always did:
//   * jikan_cache rows under the exact keys the Worker asks for (lib/jikan-paths.ts), and
//   * catalog rows, which search, seasons, schedule and show pages fall back to.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { arg, flag, sleep } from "./lib";
import {
  catalogColumns, currentSeason, FALLBACK_GENRES, isAdult, PATHS, SEASONS, TOP_LISTS, trimAnime,
  WEEKDAYS, type SeasonName, type TopList,
} from "../lib/jikan-paths";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

const DB_NAME = arg("db") ?? "felll";
const LOCAL = flag("local");
const QUICK = flag("quick");
const FORCE_SOURCE = arg("source"); // "anilist" | "kitsu"
const TARGET = Number(arg("pages")) || (QUICK ? 300 : 1500); // how many titles to aim for
// Full show-page caches are only worth it for titles people actually open; the
// long tail falls back to the catalog row, so cap how many we write.
const FULL_CACHE_MAX = Number(arg("full")) || 3000;
// Keep under the upstreams' rate limits on big crawls.
const SPACING_MS = Number(process.env.SYNC_SPACING_MS) || 300;

let requests = 0;
let lastReq = 0;
async function pace() {
  const wait = lastReq + SPACING_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastReq = Date.now();
}

// ---------------------------------------------------------------------------
// A source abstraction: each upstream answers the same abstract list queries
// and hands back titles already in the Jikan shape.
// ---------------------------------------------------------------------------

type Sort = "trending" | "popular" | "score" | "favorites";
type Status = "releasing" | "upcoming" | "finished";
interface Spec {
  sort: Sort;
  status?: Status;
  season?: { year: number; season: SeasonName };
  year?: number; // a whole year (for the deep, long-tail crawl)
  format?: "movie";
  page: number;
  perPage: number;
}
interface ListResult {
  items: Raw[]; // mapped to the Jikan shape
  hasNext: boolean;
  total: number;
  perPage: number;
  page: number;
}
interface Source {
  name: string;
  maxPerPage: number;
  probe(): Promise<boolean>;
  query(spec: Spec): Promise<ListResult>;
}

// ---- shared mapping helpers -----------------------------------------------

const WEEKDAY_NAME = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n: number) => String(n).padStart(2, "0");

const GENRE_ID = new Map<string, number>(FALLBACK_GENRES.map(([id, name]) => [name, id]));
let nextGenreId = 900;
const genreId = (name: string) => GENRE_ID.get(name) ?? (GENRE_ID.set(name, ++nextGenreId), nextGenreId);

function isoFromYMD(y?: number | null, mo?: number | null, d?: number | null): string | null {
  if (!y) return null;
  return new Date(Date.UTC(y, (mo ?? 1) - 1, d ?? 1)).toISOString();
}
function dateLabel(y?: number | null, mo?: number | null, d?: number | null): string | null {
  if (!y) return null;
  return mo ? `${MONTHS[mo - 1]} ${d ?? 1}, ${y}` : String(y);
}
/** MAL's seasons: winter Jan–Mar, spring Apr–Jun, summer Jul–Sep, fall Oct–Dec. */
function seasonOf(month?: number | null): SeasonName | null {
  if (!month) return null;
  const i = month - 1;
  return i < 3 ? "winter" : i < 6 ? "spring" : i < 9 ? "summer" : "fall";
}
function durationLabel(mins: number | null, isMovie: boolean): string | null {
  if (!mins) return null;
  if (isMovie) return mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60} min` : `${mins} min`;
  return `${mins} min per ep`;
}
const stripHtml = (s: string | null | undefined) =>
  (s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();

// ---------------------------------------------------------------------------
// AniList (preferred)
// ---------------------------------------------------------------------------

const ANILIST = (process.env.ANILIST_URL || "https://graphql.anilist.co").replace(/\/+$/, "");
const ANI_SORT: Record<Sort, string> = {
  trending: "TRENDING_DESC", popular: "POPULARITY_DESC", score: "SCORE_DESC", favorites: "FAVOURITES_DESC",
};
const ANI_STATUS: Record<Status, string> = {
  releasing: "RELEASING", upcoming: "NOT_YET_RELEASED", finished: "FINISHED",
};
const ANI_SEASON: Record<SeasonName, string> = { winter: "WINTER", spring: "SPRING", summer: "SUMMER", fall: "FALL" };

const ANI_MEDIA = `
  idMal title { romaji english native } synonyms format status description(asHtml: false)
  startDate { year month day } endDate { year month day } season seasonYear episodes duration
  source averageScore popularity favourites genres isAdult coverImage { extraLarge large medium }
  trailer { id site } studios { nodes { name isAnimationStudio } }
  nextAiringEpisode { airingAt episode } rankings { rank type allTime }`;
const ANI_QUERY = `
  query ($page: Int, $perPage: Int, $sort: [MediaSort], $season: MediaSeason, $seasonYear: Int, $status: MediaStatus, $format: MediaFormat) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage total }
      media(type: ANIME, isAdult: false, sort: $sort, season: $season, seasonYear: $seasonYear, status: $status, format: $format) { ${ANI_MEDIA} }
    }
  }`;

const ANI_FORMAT: Record<string, string> = { TV: "TV", TV_SHORT: "TV", MOVIE: "Movie", SPECIAL: "Special", OVA: "OVA", ONA: "ONA", MUSIC: "Music" };
const ANI_STATUS_LABEL: Record<string, string> = { FINISHED: "Finished Airing", RELEASING: "Currently Airing", NOT_YET_RELEASED: "Not yet aired", CANCELLED: "Finished Airing", HIATUS: "Currently Airing" };
const ANI_SOURCE: Record<string, string> = { ORIGINAL: "Original", MANGA: "Manga", LIGHT_NOVEL: "Light novel", VISUAL_NOVEL: "Visual novel", VIDEO_GAME: "Game", NOVEL: "Novel", OTHER: "Other", WEB_NOVEL: "Web novel", DOUJINSHI: "Doujinshi", PICTURE_BOOK: "Picture book", CARD_GAME: "Card game", MULTIMEDIA_PROJECT: "Mixed media" };

function aniBroadcast(next: Raw): { day: string | null; time: string | null; timezone: string | null } {
  if (!next?.airingAt) return { day: null, time: null, timezone: null };
  const jst = new Date(next.airingAt * 1000 + 9 * 3600 * 1000);
  return { day: WEEKDAY_NAME[jst.getUTCDay()], time: `${pad2(jst.getUTCHours())}:${pad2(jst.getUTCMinutes())}`, timezone: "Asia/Tokyo" };
}
function aniRank(rankings: Raw[], type: string): number | null {
  return (rankings ?? []).find((x) => x.type === type && x.allTime)?.rank ?? null;
}
function mapAniList(m: Raw): Raw | null {
  if (!m?.idMal || m.isAdult) return null;
  const t = m.title ?? {};
  const format = ANI_FORMAT[m.format] ?? "TV";
  const s = m.startDate ?? {};
  const cover = m.coverImage ?? {};
  const large = cover.extraLarge || cover.large || cover.medium || null;
  const small = cover.large || cover.medium || null;
  const yt = m.trailer?.site === "youtube" && m.trailer.id ? m.trailer.id : null;
  const releasing = m.status === "RELEASING";
  const startStr = dateLabel(s.year, s.month, s.day);
  const endStr = dateLabel(m.endDate?.year, m.endDate?.month, m.endDate?.day);
  return {
    mal_id: m.idMal,
    title: t.romaji || t.english || t.native || `Anime ${m.idMal}`,
    title_english: t.english || null,
    title_japanese: t.native || null,
    title_synonyms: (m.synonyms ?? []).slice(0, 6),
    images: { webp: { image_url: small, large_image_url: large }, jpg: { image_url: small, large_image_url: large } },
    trailer: yt ? { youtube_id: yt, embed_url: `https://www.youtube.com/embed/${yt}` } : null,
    type: format,
    source: ANI_SOURCE[m.source] ?? null,
    episodes: m.episodes ?? null,
    status: ANI_STATUS_LABEL[m.status] ?? null,
    airing: releasing,
    aired: { from: isoFromYMD(s.year, s.month, s.day), string: startStr ? (format === "Movie" ? startStr : `${startStr} to ${endStr ?? (releasing ? "?" : startStr)}`) : null, prop: { from: { year: s.year ?? null } } },
    duration: durationLabel(m.duration ?? null, format === "Movie"),
    rating: null,
    score: m.averageScore != null ? Math.round(m.averageScore) / 10 : null,
    scored_by: null,
    rank: aniRank(m.rankings, "RATED"),
    popularity: aniRank(m.rankings, "POPULAR"),
    members: m.popularity ?? 0,
    favorites: m.favourites ?? 0,
    synopsis: stripHtml(m.description),
    background: null,
    season: m.season ? m.season.toLowerCase() : null,
    year: m.seasonYear ?? s.year ?? null,
    broadcast: aniBroadcast(m.nextAiringEpisode),
    studios: (m.studios?.nodes ?? []).filter((x: Raw) => x.isAnimationStudio).map((x: Raw) => ({ name: x.name })),
    genres: (m.genres ?? []).map((g: string) => ({ mal_id: genreId(g), name: g })),
    themes: [],
    demographics: [],
  };
}

const anilistSource: Source = {
  name: "AniList",
  maxPerPage: 50,
  async probe() {
    try {
      const res = await fetch(ANILIST, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "{Page(perPage:1){media(type:ANIME){idMal}}}" }) });
      return res.ok;
    } catch {
      return false;
    }
  },
  async query(spec) {
    const variables: Record<string, unknown> = { page: spec.page, perPage: Math.min(spec.perPage, 50), sort: [ANI_SORT[spec.sort]] };
    if (spec.status) variables.status = ANI_STATUS[spec.status];
    if (spec.season) { variables.season = ANI_SEASON[spec.season.season]; variables.seasonYear = spec.season.year; }
    if (spec.year) variables.seasonYear = spec.year;
    if (spec.format === "movie") variables.format = "MOVIE";
    for (let attempt = 0; attempt < 6; attempt++) {
      await pace();
      requests++;
      let res: Response | null = null;
      try {
        res = await fetch(ANILIST, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "user-agent": "cupcake.gg sync (+https://github.com/reputing/felll)" }, body: JSON.stringify({ query: ANI_QUERY, variables }) });
      } catch { res = null; }
      if (res?.ok) {
        const body = (await res.json()) as { data?: { Page?: { media: Raw[]; pageInfo: Raw } }; errors?: Raw[] };
        const pg = body.data?.Page;
        if (pg) return { items: (pg.media ?? []).map(mapAniList).filter(Boolean) as Raw[], hasNext: !!pg.pageInfo?.hasNextPage, total: pg.pageInfo?.total ?? 0, perPage: Number(variables.perPage), page: spec.page };
        console.warn(`  AniList error: ${JSON.stringify(body.errors)?.slice(0, 160)}`);
        return { items: [], hasNext: false, total: 0, perPage: Number(variables.perPage), page: spec.page };
      }
      const retry = Number(res?.headers.get("retry-after"));
      const backoff = res?.status === 429 ? (retry ? retry * 1000 : 60_000) : 1500 * (attempt + 1);
      console.warn(`  ${res?.status ?? "network error"} on AniList, retrying in ${Math.round(backoff / 1000)}s`);
      await sleep(backoff);
    }
    return { items: [], hasNext: false, total: 0, perPage: Number(variables.perPage), page: spec.page };
  },
};

// ---------------------------------------------------------------------------
// Kitsu (fallback) — JSON:API, carries the MAL id via `mappings`.
// ---------------------------------------------------------------------------

const KITSU = (process.env.KITSU_URL || "https://kitsu.app/api/edge").replace(/\/+$/, "");
const KITSU_SORT: Record<Sort, string> = { trending: "-userCount", popular: "-userCount", score: "-averageRating", favorites: "-favoritesCount" };
const KITSU_STATUS: Record<Status, string> = { releasing: "current", upcoming: "upcoming", finished: "finished" };
const KITSU_SUBTYPE: Record<string, string> = { TV: "TV", movie: "Movie", OVA: "OVA", ONA: "ONA", special: "Special", music: "Music" };
const KITSU_STATUS_LABEL: Record<string, string> = { current: "Currently Airing", finished: "Finished Airing", tba: "Not yet aired", unreleased: "Not yet aired", upcoming: "Not yet aired" };

const ymd = (date: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : { year: null, month: null, day: null };
};

function mapKitsu(anime: Raw, malId: number, categories: string[]): Raw | null {
  const at = anime.attributes ?? {};
  if (at.nsfw || /^R18/i.test(at.ageRating ?? "")) return null;
  const titles = at.titles ?? {};
  const romaji = titles.en_jp || at.canonicalTitle || titles.en || titles.ja_jp || `Anime ${malId}`;
  const isMovie = at.subtype === "movie";
  const start = ymd(at.startDate);
  const end = ymd(at.endDate);
  const poster = at.posterImage ?? {};
  const large = poster.large || poster.original || poster.medium || null;
  const small = poster.medium || poster.small || large;
  const yt = at.youtubeVideoId || null;
  const releasing = at.status === "current";
  const startStr = dateLabel(start.year, start.month, start.day);
  const endStr = dateLabel(end.year, end.month, end.day);
  return {
    mal_id: malId,
    title: romaji,
    title_english: titles.en || titles.en_us || null,
    title_japanese: titles.ja_jp || null,
    title_synonyms: (at.abbreviatedTitles ?? []).slice(0, 6),
    images: { webp: { image_url: small, large_image_url: large }, jpg: { image_url: small, large_image_url: large } },
    trailer: yt ? { youtube_id: yt, embed_url: `https://www.youtube.com/embed/${yt}` } : null,
    type: KITSU_SUBTYPE[at.subtype] ?? "TV",
    source: null,
    episodes: at.episodeCount ?? null,
    status: KITSU_STATUS_LABEL[at.status] ?? null,
    airing: releasing,
    aired: { from: isoFromYMD(start.year, start.month, start.day), string: startStr ? (isMovie ? startStr : `${startStr} to ${endStr ?? (releasing ? "?" : startStr)}`) : null, prop: { from: { year: start.year } } },
    duration: durationLabel(at.episodeLength ?? null, isMovie),
    rating: null,
    score: at.averageRating ? Math.round(Number(at.averageRating)) / 10 : null,
    scored_by: null,
    rank: at.ratingRank ?? null,
    popularity: at.popularityRank ?? null,
    members: at.userCount ?? 0,
    favorites: at.favoritesCount ?? 0,
    synopsis: stripHtml(at.synopsis || at.description),
    background: null,
    season: seasonOf(start.month),
    year: start.year,
    broadcast: { day: null, time: null, timezone: null },
    studios: [],
    genres: categories.slice(0, 8).map((name) => ({ mal_id: genreId(name), name })),
    themes: [],
    demographics: [],
  };
}

const kitsuSource: Source = {
  name: "Kitsu",
  maxPerPage: 20,
  async probe() {
    try {
      const res = await fetch(`${KITSU}/anime?page%5Blimit%5D=1`, { headers: { accept: "application/vnd.api+json" } });
      return res.ok;
    } catch {
      return false;
    }
  },
  async query(spec) {
    const perPage = Math.min(spec.perPage, 20);
    const qs = new URLSearchParams();
    qs.set("page[limit]", String(perPage));
    qs.set("page[offset]", String((spec.page - 1) * perPage));
    qs.set("sort", KITSU_SORT[spec.sort]);
    qs.set("include", "mappings,categories");
    qs.set("fields[mappings]", "externalSite,externalId");
    qs.set("fields[categories]", "title");
    if (spec.status) qs.set("filter[status]", KITSU_STATUS[spec.status]);
    if (spec.format === "movie") qs.set("filter[subtype]", "movie");
    if (spec.season) { qs.set("filter[season]", spec.season.season); qs.set("filter[seasonYear]", String(spec.season.year)); }
    if (spec.year) qs.set("filter[seasonYear]", String(spec.year));
    const url = `${KITSU}/anime?${qs.toString().replace(/%5B/gi, "[").replace(/%5D/gi, "]")}`;
    for (let attempt = 0; attempt < 6; attempt++) {
      await pace();
      requests++;
      let res: Response | null = null;
      try {
        res = await fetch(url, { headers: { accept: "application/vnd.api+json", "user-agent": "cupcake.gg sync (+https://github.com/reputing/felll)" } });
      } catch { res = null; }
      if (res?.ok) {
        const body = (await res.json()) as { data?: Raw[]; included?: Raw[]; links?: { next?: string }; meta?: { count?: number } };
        const mal = new Map<string, number>();
        const cat = new Map<string, string>();
        for (const inc of body.included ?? []) {
          if (inc.type === "mappings" && inc.attributes?.externalSite === "myanimelist/anime") mal.set(inc.id, Number(inc.attributes.externalId));
          else if (inc.type === "categories") cat.set(inc.id, inc.attributes?.title);
        }
        const items: Raw[] = [];
        for (const a of body.data ?? []) {
          let malId: number | undefined;
          for (const ref of a.relationships?.mappings?.data ?? []) { const m = mal.get(ref.id); if (m) { malId = m; break; } }
          if (!malId) continue;
          const cats = (a.relationships?.categories?.data ?? []).map((r: Raw) => cat.get(r.id)).filter(Boolean) as string[];
          const mapped = mapKitsu(a, malId, cats);
          if (mapped) items.push(mapped);
        }
        return { items, hasNext: !!body.links?.next, total: body.meta?.count ?? 0, perPage, page: spec.page };
      }
      const backoff = res?.status === 429 ? 5000 : 1500 * (attempt + 1);
      console.warn(`  ${res?.status ?? "network error"} on Kitsu, retrying in ${Math.round(backoff / 1000)}s`);
      await sleep(backoff);
    }
    return { items: [], hasNext: false, total: 0, perPage, page: spec.page };
  },
};

// ---------------------------------------------------------------------------
// SQL — the same D1 write mechanics sync-jikan used.
// ---------------------------------------------------------------------------

const lit = (v: unknown) =>
  v == null ? "null" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "null") : `'${String(v).replace(/'/g, "''")}'`;
const MAX_STATEMENT = 95_000;
let pending: string[] = [];

function cache(key: string, body: Raw) {
  const stmt = `insert into jikan_cache (key, body, fetched_at) values (${lit(key)}, ${lit(JSON.stringify(body))}, unixepoch()) on conflict(key) do update set body = excluded.body, fetched_at = excluded.fetched_at;`;
  if (stmt.length > MAX_STATEMENT) return console.warn(`  skipped caching ${key}: too big`);
  pending.push(stmt);
}

const seen = new Set<number>();
function catalog(m: Raw) {
  if (!m?.mal_id || isAdult(m)) return;
  const c = catalogColumns(m);
  const body = JSON.stringify(trimAnime(m, 4000));
  const cols = ["mal_id", "search", "members", "favorites", "score", "year", "season", "kind", "status", "airing", "broadcast_day", "genres", "start_date", "body"];
  const vals = [c.mal_id, c.search, c.members, c.favorites, c.score, c.year, c.season, c.kind, c.status, c.airing, c.broadcast_day, c.genres, c.start_date, body];
  pending.push(
    `insert into catalog (${cols.join(", ")}, updated_at) values (${vals.map(lit).join(", ")}, unixepoch())
     on conflict(mal_id) do update set ${cols.slice(1).map((k) => `${k} = excluded.${k}`).join(", ")}, updated_at = unixepoch();`,
  );
  seen.add(c.mal_id);
}

/** Cache a title's show page under /anime/{id}/full, so pages never call live Jikan. */
const cacheFull = (m: Raw) => cache(PATHS.full(m.mal_id), { data: trimAnime(m, 8000) });

/** Cache a list under `key`, synopses shortened to fit D1's statement limit. */
function cacheList(key: string, items: Raw[], info?: ListResult) {
  const pagination = info
    ? { has_next_page: info.hasNext, current_page: info.page, last_visible_page: Math.max(1, Math.ceil((info.total || items.length) / info.perPage)), items: { total: info.total || items.length } }
    : null;
  for (const max of [400, 120]) {
    const body = { data: items.map((m) => trimAnime(m, max)), pagination };
    if (JSON.stringify(body).length < MAX_STATEMENT - 500) { cache(key, body); break; }
  }
}

const dir = mkdtempSync(join(tmpdir(), "cupcake-sync-"));
let flushes = 0;
function flush(label: string) {
  if (!pending.length) return;
  const chunks: string[][] = [[]];
  let size = 0;
  for (const s of pending) {
    if (size + s.length > 4_000_000) { chunks.push([]); size = 0; }
    chunks[chunks.length - 1].push(s);
    size += s.length;
  }
  for (const chunk of chunks) {
    const file = join(dir, `sync-${++flushes}.sql`);
    writeFileSync(file, chunk.join("\n"));
    const win = process.platform === "win32";
    const args = ["wrangler", "d1", "execute", DB_NAME, LOCAL ? "--local" : "--remote", "--yes", win ? `--file="${file}"` : `--file=${file}`];
    try {
      execFileSync("npx", args, { stdio: ["ignore", "pipe", "pipe"], shell: win });
    } catch (e) {
      const err = e as { stderr?: Buffer; stdout?: Buffer };
      console.error((err.stderr?.toString() || err.stdout?.toString() || String(e)).slice(-1500));
      throw new Error(`Writing ${label} to D1 failed (above). Are you logged in? Try: npx wrangler login`);
    }
  }
  console.log(`  ✓ saved ${label} (${pending.length} rows)`);
  pending = [];
}

// ---------------------------------------------------------------------------
// The crawl — source-agnostic.
// ---------------------------------------------------------------------------

const everything = new Map<number, Raw>();
const airing = new Map<number, Raw>();

function collect(items: Raw[]) {
  for (const m of items) {
    if (isAdult(m)) continue;
    everything.set(m.mal_id, m);
    if (m.airing) airing.set(m.mal_id, m);
  }
}

function shift(year: number, season: SeasonName, by: number) {
  const i = SEASONS.indexOf(season) + by;
  return { year: year + Math.floor(i / 4), season: SEASONS[((i % 4) + 4) % 4] };
}

const TOP_SPEC: Record<TopList, Omit<Spec, "page" | "perPage">> = {
  airing: { sort: "score", status: "releasing" },
  upcoming: { sort: "popular", status: "upcoming" },
  all: { sort: "score" },
  popular: { sort: "popular" },
  loved: { sort: "favorites" },
  films: { sort: "score", format: "movie" },
};

async function main() {
  const started = Date.now();

  let source: Source | null = null;
  const forced = FORCE_SOURCE === "kitsu" ? [kitsuSource] : FORCE_SOURCE === "anilist" ? [anilistSource] : [anilistSource, kitsuSource];
  for (const s of forced) {
    process.stdout.write(`Checking ${s.name}… `);
    if (await s.probe()) { console.log("up."); source = s; break; }
    console.log("unavailable.");
  }
  if (!source) throw new Error("No catalog source is reachable right now (tried AniList and Kitsu). Try again shortly.");

  console.log(`Syncing from ${source.name} into D1 "${DB_NAME}" (${LOCAL ? "local" : "remote"})${QUICK ? ", quick" : ""}.`);
  const per = source.maxPerPage;

  async function listOnce(key: string, spec: Omit<Spec, "page" | "perPage">, limit = 25) {
    const r = await source!.query({ ...spec, page: 1, perPage: Math.min(limit, per) });
    collect(r.items);
    cacheList(key, r.items.slice(0, limit), r);
  }
  async function listPaged(key: (p: number) => string, spec: Omit<Spec, "page" | "perPage">, maxPages: number) {
    for (let p = 1; p <= maxPages; p++) {
      const r = await source!.query({ ...spec, page: p, perPage: Math.min(25, per) });
      collect(r.items);
      cacheList(key(p), r.items, r);
      if (!r.hasNext || !r.items.length) break;
    }
  }

  // Home — the five front-page rows.
  console.log("Home lists…");
  await listOnce(PATHS.homeAiring, { sort: "trending", status: "releasing" });
  const cur = currentSeason();
  await listOnce(PATHS.homeSeason, { sort: "popular", season: cur });
  await listOnce(PATHS.homeTop, { sort: "score" });
  await listOnce(PATHS.homePopular, { sort: "popular" });
  await listOnce(PATHS.homeUpcoming, { sort: "popular", status: "upcoming" });
  flush("home lists");

  // Seasons — this one, next, last — plus the upcoming pages.
  console.log("Seasons…");
  await listPaged((p) => PATHS.season(cur.year, cur.season, p), { sort: "popular", season: cur }, QUICK ? 2 : 5);
  const next = shift(cur.year, cur.season, 1);
  await listPaged((p) => PATHS.season(next.year, next.season, p), { sort: "popular", season: next }, QUICK ? 1 : 3);
  if (!QUICK) {
    const prev = shift(cur.year, cur.season, -1);
    await listPaged((p) => PATHS.season(prev.year, prev.season, p), { sort: "popular", season: prev }, 3);
  }
  await listPaged((p) => PATHS.upcoming(p), { sort: "popular", status: "upcoming" }, QUICK ? 1 : 3);
  flush("seasons");

  // Rankings — the six top lists.
  console.log("Rankings…");
  for (const l of Object.keys(TOP_LISTS) as TopList[]) await listPaged((p) => PATHS.top(l, p), TOP_SPEC[l], QUICK ? 1 : 2);
  flush("rankings");

  // The catalog proper — the most popular titles, until we hit the target.
  console.log(`Catalog: aiming for ${TARGET} titles…`);
  for (let p = 1; everything.size < TARGET; p++) {
    const r = await source.query({ sort: "popular", page: p, perPage: per });
    collect(r.items);
    if (!r.items.length || !r.hasNext) break;
  }

  // Popularity pagination caps out (~5k on AniList), so for the long tail crawl
  // year by year — each year is its own result space — newest first.
  if (everything.size < TARGET) {
    const thisYear = new Date().getUTCFullYear();
    console.log(`Deep crawl: year by year to reach ${TARGET}…`);
    for (let y = thisYear + 1; y >= 1960 && everything.size < TARGET; y--) {
      const before = everything.size;
      for (let p = 1; p <= 12; p++) {
        const r = await source.query({ sort: "popular", year: y, page: p, perPage: per });
        collect(r.items);
        if (!r.items.length || !r.hasNext) break;
      }
      if (everything.size > before && everything.size % 1000 < (everything.size - before)) console.log(`  …${everything.size} titles (through ${y})`);
    }
  }

  // Genres — from everything we gathered, with MAL ids where we know them.
  const genreCount = new Map<string, number>();
  for (const m of everything.values()) for (const g of m.genres) genreCount.set(g.name, (genreCount.get(g.name) ?? 0) + 1);
  cache(PATHS.genres, { data: [...genreCount.entries()].map(([name, count]) => ({ mal_id: genreId(name), name, count })) });

  // Schedule — airing shows grouped by weekday (only when the source gives a broadcast slot).
  for (const day of WEEKDAYS) {
    const name = WEEKDAY_NAME[WEEKDAYS.indexOf(day)];
    const shows = [...airing.values()].filter((m) => m.broadcast.day === name).sort((a, b) => b.members - a.members).slice(0, 25);
    if (shows.length) cacheList(PATHS.schedule(day), shows);
  }

  // Every title → a catalog row and a cached show page, so no page ever waits on live Jikan.
  console.log(`Writing ${everything.size} titles…`);
  let n = 0;
  for (const m of everything.values()) {
    catalog(m);
    if (n < FULL_CACHE_MAX) cacheFull(m);
    if (++n % 400 === 0) flush(`titles ${n - 399}-${n}`);
  }
  flush("titles");

  rmSync(dir, { recursive: true, force: true });
  console.log(`Done in ${Math.round((Date.now() - started) / 60000)} min from ${source.name}: ${seen.size} titles, ${requests} requests.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
