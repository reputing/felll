import { background, db, env, now } from "./db";
import { catalogColumns, currentSeason, FALLBACK_GENRES, isAdult, PATHS, SEASONS, TOP_LISTS, WEEKDAYS, type SeasonName, type TopList, type Weekday } from "./jikan-paths";

export { currentSeason, SEASONS, TOP_LISTS, WEEKDAYS };
export type { SeasonName, TopList };

// Jikan (unofficial MyAnimeList API, https://jikan.moe) is the catalog.
//
// It is free, rate limited (3 req/s, 60/min per IP) and goes down from time to
// time, so no page ever waits on it if we have anything to show:
//
//   memory (this isolate) → Cloudflare edge cache → D1 (survives outages)
//
// A fresh copy at any level is returned straight away. A stale D1 copy is
// returned too, and refreshed after the response is sent. Only a title nobody
// has looked at before costs a live request, and those are spaced out and
// time-boxed so a slow Jikan can't hold a page hostage.
//
// Jikan may also refuse Cloudflare's shared Worker IPs outright. So:
//   * after a failed live call, live calls stop for a minute (no page waits
//     on a dead upstream more than once), and
//   * every query below falls back to the `catalog` table, a copy of the
//     catalog that `npm run sync` fills from outside Cloudflare.

const DEFAULT_BASE = "https://api.jikan.moe/v4";
const TIMEOUT_MS = 5000;
const SPACING_MS = 360; // ≈ 3 requests a second
const COOL_OFF_MS = 60_000;
const USER_AGENT = "cupcake.gg/1.0 (+https://github.com/reputing/felll)";

export class JikanError extends Error {}

type Entry = { body: string; at: number };
const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<string>>();
let nextSlot = 0;
let downUntil = 0;
/** The most recent live failure, for /api/health. */
export let lastJikanError: { at: number; message: string } | null = null;

async function base() {
  try {
    return ((await env()).JIKAN_URL || DEFAULT_BASE).replace(/\/+$/, "");
  } catch {
    return DEFAULT_BASE;
  }
}

async function slot() {
  const t = Date.now();
  const wait = Math.max(0, nextSlot - t);
  nextSlot = Math.max(t, nextSlot) + SPACING_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

/** One live request to Jikan. Exported for the random pick and /api/health. */
export async function live(path: string, opts: { force?: boolean } = {}): Promise<string> {
  if (!opts.force && Date.now() < downUntil) throw new JikanError(lastJikanError?.message ?? "Jikan is cooling off");
  const url = (await base()) + path;
  const fail = (message: string): never => {
    downUntil = Date.now() + COOL_OFF_MS;
    lastJikanError = { at: Date.now(), message };
    throw new JikanError(message);
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    await slot();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      return fail(`Jikan unreachable: ${e instanceof Error ? e.message : e}`);
    }
    if (res.ok) return res.text();
    if (res.status === 404) throw new JikanError("not found");
    // only a rate limit is worth a second try; a block or an outage isn't
    if (res.status !== 429 || attempt) {
      const snippet = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
      return fail(`Jikan ${res.status}${snippet ? `: ${snippet}` : ""}`);
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  return fail("Jikan unreachable");
}

function edgeCache(): Cache | null {
  try {
    return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}
const edgeKey = (path: string) => new Request("https://jikan.cache" + path);

async function store(path: string, body: string, ttl: number) {
  memory.set(path, { body, at: now() });
  if (memory.size > 400) memory.delete(memory.keys().next().value!);
  const cache = edgeCache();
  await Promise.allSettled([
    cache?.put(edgeKey(path), new Response(body, { headers: { "cache-control": `max-age=${ttl}` } })),
    (await db())
      .prepare("insert into jikan_cache (key, body, fetched_at) values (?, ?, ?) on conflict(key) do update set body = excluded.body, fetched_at = excluded.fetched_at")
      .bind(path, body, now())
      .run(),
  ]);
}

function refresh(path: string, ttl: number): Promise<string> {
  let p = inflight.get(path);
  if (!p) {
    p = live(path)
      .then(async (body) => {
        await store(path, body, ttl);
        return body;
      })
      .finally(() => inflight.delete(path));
    inflight.set(path, p);
  }
  return p;
}

/** GET a Jikan path (e.g. "/anime/1/full"), served from cache whenever possible. */
export async function jikan<T>(path: string, ttl = 3600): Promise<T> {
  const m = memory.get(path);
  if (m && now() - m.at < ttl) return JSON.parse(m.body);

  const cache = edgeCache();
  const hit = await cache?.match(edgeKey(path)).catch(() => undefined);
  if (hit) {
    const body = await hit.text();
    memory.set(path, { body, at: now() });
    return JSON.parse(body);
  }

  let row: { body: string; fetched_at: number } | null = null;
  try {
    row = await (await db()).prepare("select body, fetched_at from jikan_cache where key = ?").bind(path).first();
  } catch {
    // no database (e.g. a build step): go live
  }
  if (row) {
    const age = now() - row.fetched_at;
    memory.set(path, { body: row.body, at: row.fetched_at });
    if (age >= ttl) await background(refresh(path, ttl));
    return JSON.parse(row.body);
  }
  return JSON.parse(await refresh(path, ttl));
}

/** Same, but an empty fallback instead of an error: for page sections. */
export async function jikanOr<T>(path: string, fallback: T, ttl?: number): Promise<T> {
  try {
    return await jikan<T>(path, ttl);
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type Group = "tv" | "film" | "other";

export interface Anime {
  id: number;
  title: string;
  romaji: string;
  native: string;
  synonyms: string[];
  poster: string | null;
  posterSm: string | null;
  banner: string | null;
  color: string;
  format: string;
  group: Group;
  episodes: number | null;
  status: string;
  airing: boolean;
  score: string;
  scoreN: number;
  scoredBy: number;
  rank: number | null;
  popularity: number | null;
  members: number;
  favorites: number;
  year: number | null;
  season: string | null;
  genres: string[];
  themes: string[];
  demographic: string | null;
  studio: string;
  studios: string[];
  source: string;
  rating: string;
  duration: string;
  aired: string;
  airedFrom: string | null;
  broadcast: { day: string | null; time: string | null; timezone: string | null };
  trailer: string | null;
  description: string;
  background: string;
}

export interface Relation {
  relation: string;
  entries: { id: number; type: string; name: string }[];
}

export interface AnimeFull extends Anime {
  relations: Relation[];
  openings: string[];
  endings: string[];
  streaming: { name: string; url: string }[];
}

export interface Character {
  id: number;
  name: string;
  image: string | null;
  role: string;
  favorites: number;
  va: { id: number; name: string; image: string | null } | null;
}

export interface EpisodeInfo {
  number: number;
  title: string;
  romaji: string | null;
  aired: string | null;
  score: number | null;
  filler: boolean;
  recap: boolean;
}

export interface Page<T> {
  items: T[];
  hasNext: boolean;
  lastPage: number;
  total: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

const PALETTE = ["#e8679a", "#4fbf9c", "#9479e8", "#e0a93a", "#4aa6dd", "#ef8a5c", "#c98aa4", "#6c8ae4"];
export const colorFor = (id: number) => PALETTE[id % PALETTE.length];

const FORMAT: Record<string, string> = { TV: "TV", "TV Special": "TV special", Movie: "Film", OVA: "OVA", ONA: "ONA", Special: "Special", Music: "Music", PV: "PV", CM: "CM" };
export const formatLabel = (a: Pick<Anime, "format">) => FORMAT[a.format] ?? a.format ?? "Anime";

function youtubeId(t: Raw): string | null {
  if (!t) return null;
  if (t.youtube_id) return t.youtube_id;
  const m = String(t.embed_url || t.url || "").match(/(?:embed\/|v=|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

const clean = (s: string | null | undefined) =>
  (s ?? "").replace(/\[Written by MAL Rewrite\]/gi, "").replace(/\(Source:[^)]*\)/gi, "").replace(/\s+\n/g, "\n").trim();

export function normAnime(m: Raw): Anime {
  const titles: Raw[] = m.titles ?? [];
  const english = m.title_english || titles.find((t) => t.type === "English")?.title;
  const yt = youtubeId(m.trailer);
  const poster = m.images?.webp?.large_image_url || m.images?.jpg?.large_image_url || m.images?.jpg?.image_url || null;
  const format = m.type ?? "TV";
  return {
    id: m.mal_id,
    title: english || m.title,
    romaji: m.title,
    native: m.title_japanese || "",
    synonyms: m.title_synonyms ?? [],
    poster,
    posterSm: m.images?.webp?.image_url || m.images?.jpg?.image_url || poster,
    banner: yt ? `https://i.ytimg.com/vi/${yt}/maxresdefault.jpg` : null,
    color: colorFor(m.mal_id),
    format,
    group: format === "Movie" ? "film" : format === "TV" ? "tv" : "other",
    episodes: m.episodes ?? null,
    status: m.status ?? "",
    airing: !!m.airing,
    score: m.score ? Number(m.score).toFixed(2) : "–",
    scoreN: m.score ? Math.round(m.score * 10) : 0,
    scoredBy: m.scored_by ?? 0,
    rank: m.rank ?? null,
    popularity: m.popularity ?? null,
    members: m.members ?? 0,
    favorites: m.favorites ?? 0,
    year: m.year ?? (m.aired?.prop?.from?.year || null),
    season: m.season ?? null,
    genres: (m.genres ?? []).map((g: Raw) => g.name),
    themes: (m.themes ?? []).map((g: Raw) => g.name),
    demographic: m.demographics?.[0]?.name ?? null,
    studio: m.studios?.[0]?.name ?? "",
    studios: (m.studios ?? []).map((s: Raw) => s.name),
    source: m.source ?? "",
    rating: m.rating ?? "",
    duration: m.duration ?? "",
    aired: m.aired?.string ?? "",
    airedFrom: m.aired?.from ?? null,
    broadcast: { day: m.broadcast?.day ?? null, time: m.broadcast?.time ?? null, timezone: m.broadcast?.timezone ?? null },
    trailer: yt,
    description: clean(m.synopsis),
    background: clean(m.background),
  };
}

function list(data: Raw): Anime[] {
  const seen = new Set<number>();
  return ((data?.data ?? []) as Raw[])
    .filter((m) => m && !isAdult(m) && !seen.has(m.mal_id) && seen.add(m.mal_id))
    .map(normAnime);
}

function page(data: Raw): Page<Anime> {
  return {
    items: list(data),
    hasNext: !!data?.pagination?.has_next_page,
    lastPage: data?.pagination?.last_visible_page ?? 1,
    total: data?.pagination?.items?.total ?? 0,
  };
}

const EMPTY = { data: [] as Raw[], pagination: null };

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const HOUR = 3600;
const DAY = 86400;

// ---- the local catalog (fallback) -----------------------------------------

type Row = { body: string };

async function fromCatalog(where: string, params: unknown[], order = "members desc", limit = 25, offset = 0): Promise<Anime[]> {
  try {
    const { results } = await (await db())
      .prepare(`select body from catalog ${where ? `where ${where}` : ""} order by ${order} limit ? offset ?`)
      .bind(...params, limit, offset)
      .all<Row>();
    return results.map((r) => normAnime(JSON.parse(r.body)));
  } catch {
    return [];
  }
}

async function catalogPage(where: string, params: unknown[], order: string, pageNo: number, size = 24): Promise<Page<Anime>> {
  const items = await fromCatalog(where, params, order, size + 1, (pageNo - 1) * size);
  let total = 0;
  try {
    total = Number((await (await db()).prepare(`select count(*) as n from catalog ${where ? `where ${where}` : ""}`).bind(...params).first<{ n: number }>())?.n ?? 0);
  } catch { /* 0 */ }
  return { items: items.slice(0, size), hasNext: items.length > size, lastPage: Math.max(1, Math.ceil(total / size)), total };
}

/** The most popular titles straight from the local catalog — the Explore box's pool. */
export async function getCatalogTop(limit = 300): Promise<Anime[]> {
  return fromCatalog("", [], "members desc", limit, 0);
}

/** How many titles the catalog holds, for the "browse all N" links. */
export async function getCatalogCount(): Promise<number> {
  try {
    const r = await (await db()).prepare("select count(*) as n from catalog").first<{ n: number }>();
    return Number(r?.n ?? 0);
  } catch {
    return 0;
  }
}

/** A Jikan list, or the same list from the catalog when Jikan (and its cache) can't answer. */
async function listOr(path: string, ttl: number, fallback: () => Promise<Anime[]>): Promise<Anime[]> {
  try {
    const items = list(await jikan(path, ttl));
    if (items.length) return items;
  } catch { /* fall through */ }
  return fallback();
}

async function pageOr(path: string, ttl: number, fallback: () => Promise<Page<Anime>>): Promise<Page<Anime>> {
  try {
    const p = page(await jikan(path, ttl));
    if (p.items.length) return p;
  } catch { /* fall through */ }
  return fallback();
}

const AIRING = "airing = 1";
const UPCOMING = "status = 'Not yet aired'";

// ---- queries --------------------------------------------------------------

export async function getHome() {
  const cur = currentSeason();
  const [trending, season, top, popular, upcoming] = await Promise.all([
    listOr(PATHS.homeAiring, HOUR, () => fromCatalog(AIRING, [], "score desc")),
    listOr(PATHS.homeSeason, HOUR, () => fromCatalog("year = ? and season = ?", [cur.year, cur.season])),
    listOr(PATHS.homeTop, DAY, () => fromCatalog("score is not null", [], "score desc")),
    listOr(PATHS.homePopular, DAY, () => fromCatalog("", [])),
    listOr(PATHS.homeUpcoming, 6 * HOUR, () => fromCatalog(UPCOMING, [])),
  ]);
  return { trending, season, top, popular, upcoming };
}

function full(data: Raw): AnimeFull {
  return {
    ...normAnime(data),
    relations: (data.relations ?? []).map((r: Raw) => ({
      relation: r.relation,
      entries: (r.entry ?? []).map((e: Raw) => ({ id: e.mal_id, type: e.type, name: e.name })),
    })),
    openings: data.theme?.openings ?? [],
    endings: data.theme?.endings ?? [],
    streaming: (data.streaming ?? []).map((s: Raw) => ({ name: s.name, url: s.url })),
  };
}

export async function getAnime(id: number): Promise<AnimeFull | null> {
  try {
    const { data } = await jikan<{ data: Raw }>(PATHS.full(id), 6 * HOUR);
    if (!data || isAdult(data)) return null;
    return full(data);
  } catch (e) {
    const row = await (await db()).prepare("select body from catalog where mal_id = ?").bind(id).first<Row>().catch(() => null);
    if (row) return full(JSON.parse(row.body));
    if (e instanceof JikanError && e.message === "not found") return null;
    throw e;
  }
}

/** Light lookup for many ids (lists, showcases): only what's stored locally, never a live call per id. */
export async function getCachedAnime(ids: number[]): Promise<Map<number, Anime>> {
  const out = new Map<number, Anime>();
  if (!ids.length) return out;
  try {
    const { results } = await (await db())
      .prepare(`select body from catalog where mal_id in (${ids.map(() => "?").join(",")})`)
      .bind(...ids)
      .all<Row>();
    for (const r of results) {
      const a = normAnime(JSON.parse(r.body));
      out.set(a.id, a);
    }
  } catch {
    /* empty map */
  }
  return out;
}

export async function getCharacters(id: number): Promise<Character[]> {
  const { data } = await jikanOr<{ data: Raw[] }>(PATHS.characters(id), { data: [] }, 7 * DAY);
  return (data ?? [])
    .sort((a, b) => (a.role === b.role ? (b.favorites ?? 0) - (a.favorites ?? 0) : a.role === "Main" ? -1 : 1))
    .slice(0, 18)
    .map((c) => {
      const va = (c.voice_actors ?? []).find((v: Raw) => v.language === "Japanese") ?? c.voice_actors?.[0];
      return {
        id: c.character.mal_id,
        name: c.character.name,
        image: c.character.images?.webp?.image_url || c.character.images?.jpg?.image_url || null,
        role: c.role,
        favorites: c.favorites ?? 0,
        va: va ? { id: va.person.mal_id, name: va.person.name, image: va.person.images?.jpg?.image_url ?? null } : null,
      };
    });
}

export async function getEpisodeList(id: number, pageNo = 1): Promise<Page<EpisodeInfo>> {
  const data = await jikanOr<Raw>(PATHS.episodes(id, pageNo), EMPTY, DAY);
  return {
    items: (data.data ?? []).map((e: Raw) => ({
      number: e.mal_id,
      title: e.title || `Episode ${e.mal_id}`,
      romaji: e.title_romanji ?? null,
      aired: e.aired ?? null,
      score: e.score ?? null,
      filler: !!e.filler,
      recap: !!e.recap,
    })),
    hasNext: !!data.pagination?.has_next_page,
    lastPage: data.pagination?.last_visible_page ?? 1,
    total: data.pagination?.items?.total ?? (data.data ?? []).length,
  };
}

export async function getRecommendations(id: number) {
  const { data } = await jikanOr<{ data: Raw[] }>(PATHS.recommendations(id), { data: [] }, 3 * DAY);
  return (data ?? []).slice(0, 12).map((r) => ({
    id: r.entry.mal_id as number,
    title: r.entry.title as string,
    image: (r.entry.images?.webp?.large_image_url || r.entry.images?.jpg?.large_image_url || null) as string | null,
    votes: r.votes as number,
  }));
}

export async function getStatistics(id: number) {
  const { data } = await jikanOr<{ data: Raw }>(PATHS.statistics(id), { data: null }, DAY);
  if (!data) return null;
  return {
    watching: data.watching as number,
    completed: data.completed as number,
    planning: data.plan_to_watch as number,
    dropped: data.dropped as number,
    scores: ((data.scores ?? []) as Raw[]).map((s) => ({ score: s.score as number, votes: s.votes as number })),
  };
}

export interface SearchParams {
  q?: string;
  type?: string;
  status?: string;
  genres?: string;
  genreName?: string;
  order_by?: string;
  sort?: string;
  rating?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

const KIND: Record<string, string> = { tv: "TV", movie: "Movie", ova: "OVA", ona: "ONA", special: "Special", tv_special: "TV Special", music: "Music" };
const STATUS: Record<string, string> = { airing: "Currently Airing", complete: "Finished Airing", upcoming: "Not yet aired" };
const ORDER: Record<string, string> = { members: "members desc", score: "score desc", start_date: "start_date desc", favorites: "favorites desc", title: "search asc" };

/** Search the local catalog: every word has to appear in some title. */
function searchCatalog(p: SearchParams): Promise<Page<Anime>> {
  const where: string[] = [];
  const params: unknown[] = [];
  for (const w of (p.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
    where.push("search like ?");
    params.push(`%${w.replace(/[%_]/g, "")}%`);
  }
  if (p.type && KIND[p.type]) { where.push("kind = ?"); params.push(KIND[p.type]); }
  if (p.status && STATUS[p.status]) { where.push("status = ?"); params.push(STATUS[p.status]); }
  if (p.genreName) { where.push("genres like ?"); params.push(`%|${p.genreName}|%`); }
  if (p.start_date) { where.push("year = ?"); params.push(Number(p.start_date.slice(0, 4))); }
  const order = ORDER[p.order_by ?? "members"] ?? "members desc";
  return catalogPage(where.join(" and "), params, order, p.page ?? 1, p.limit ?? 24);
}

export async function searchAnime(p: SearchParams): Promise<Page<Anime>> {
  const qs = new URLSearchParams({ sfw: "true", limit: String(p.limit ?? 24), page: String(p.page ?? 1) });
  for (const k of ["q", "type", "status", "genres", "order_by", "sort", "rating", "start_date", "end_date"] as const) {
    const v = p[k];
    if (v) qs.set(k, String(v));
  }
  if (!p.q && !p.order_by) {
    qs.set("order_by", "members");
    qs.set("sort", "desc");
  }
  return pageOr(`/anime?${qs}`, p.q ? 6 * HOUR : DAY, () => searchCatalog(p));
}

export async function getSeason(year: number, season: SeasonName, pageNo = 1): Promise<Page<Anime>> {
  const cur = currentSeason();
  const ttl = year === cur.year && season === cur.season ? 6 * HOUR : 7 * DAY;
  return pageOr(PATHS.season(year, season, pageNo), ttl, () => catalogPage("year = ? and season = ?", [year, season], "members desc", pageNo, 25));
}

export async function getScheduleDay(day: Weekday): Promise<Anime[]> {
  const jikanDay = day[0].toUpperCase() + day.slice(1) + "s";
  return listOr(PATHS.schedule(day), 3 * HOUR, () => fromCatalog(`${AIRING} and broadcast_day = ?`, [jikanDay], "members desc", 40));
}

export async function getGenres(): Promise<{ id: number; name: string; count: number }[]> {
  const { data } = await jikanOr<{ data: Raw[] }>(PATHS.genres, { data: [] }, 7 * DAY);
  const got = (data ?? [])
    .filter((g, i, all) => !["Hentai", "Erotica", "Ecchi"].includes(g.name) && all.findIndex((x) => x.name === g.name) === i)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g) => ({ id: g.mal_id as number, name: g.name as string, count: g.count as number }));
  return got.length ? got : FALLBACK_GENRES.map(([id, name]) => ({ id, name, count: 0 })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getRandomId(): Promise<number | null> {
  try {
    const data = JSON.parse(await live("/random/anime?sfw=true"));
    if (!isAdult(data.data)) return data.data.mal_id;
  } catch { /* the catalog instead */ }
  const row = await (await db()).prepare("select mal_id from catalog where members > 20000 order by random() limit 1").first<{ mal_id: number }>().catch(() => null);
  return row?.mal_id ?? null;
}

// ---------------------------------------------------------------------------
// Broadcast times: Jikan gives "Saturdays 23:30 (JST)"; turn that into the
// next airing instant so it can be shown in the viewer's own time zone.
// ---------------------------------------------------------------------------

const DAY_INDEX: Record<string, number> = { Sundays: 0, Mondays: 1, Tuesdays: 2, Wednesdays: 3, Thursdays: 4, Fridays: 5, Saturdays: 6 };

export function nextAiring(a: Pick<Anime, "broadcast" | "airing">, from = Date.now()): number | null {
  const { day, time } = a.broadcast;
  if (!a.airing || !day || !time || DAY_INDEX[day] == null) return null;
  const [h, m] = time.split(":").map(Number);
  // JST is UTC+9 all year.
  const jstNow = new Date(from + 9 * HOUR * 1000);
  const target = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate(), h, m));
  let diff = (DAY_INDEX[day] - jstNow.getUTCDay() + 7) % 7;
  if (diff === 0 && target.getTime() <= jstNow.getTime()) diff = 7;
  return Math.floor((target.getTime() + diff * DAY * 1000 - 9 * HOUR * 1000) / 1000);
}

/** Best guess at the episode number airing at `at`, from the premiere date. */
export function episodeAt(a: Pick<Anime, "airedFrom" | "episodes">, at: number): number | null {
  if (!a.airedFrom) return null;
  const n = Math.floor((at - Date.parse(a.airedFrom) / 1000) / (7 * DAY)) + 1;
  if (n < 1) return 1;
  return a.episodes ? Math.min(n, a.episodes) : n;
}

export const episodesLabel = (a: Pick<Anime, "group" | "episodes" | "airing">) =>
  a.group === "film" ? "Film" : a.episodes ? `${a.episodes} episodes` : a.airing ? "Airing" : "? episodes";

/** When the first episode airs: the premiere date at the broadcast slot (JST), else the date alone. */
export function premiereAt(a: Pick<Anime, "airedFrom" | "broadcast">): number | null {
  if (!a.airedFrom) return null;
  const d = new Date(a.airedFrom);
  if (Number.isNaN(d.getTime())) return null;
  const [h, m] = (a.broadcast.time ?? "").split(":").map(Number);
  if (Number.isFinite(h) && Number.isFinite(m)) {
    return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - 9 * HOUR * 1000) / 1000);
  }
  return Math.floor(d.getTime() / 1000);
}

/** Every page of a season (Jikan pages hold 25), up to `max` pages. */
export async function getWholeSeason(year: number, season: SeasonName, max = 6): Promise<Anime[]> {
  const first = await getSeason(year, season, 1);
  const rest = await Promise.all(Array.from({ length: Math.min(first.lastPage, max) - 1 }, (_, i) => getSeason(year, season, i + 2)));
  const seen = new Set<number>();
  return [first, ...rest].flatMap((p) => p.items).filter((a) => !seen.has(a.id) && seen.add(a.id));
}

export async function getUpcoming(max = 4): Promise<Anime[]> {
  const pages: Anime[][] = [];
  for (let p = 1; p <= max; p++) {
    const pg = await pageOr(PATHS.upcoming(p), 6 * HOUR, () => catalogPage(UPCOMING, [], "members desc", p, 25));
    pages.push(pg.items);
    if (!pg.hasNext) break;
  }
  const seen = new Set<number>();
  return pages.flat().filter((a) => !seen.has(a.id) && seen.add(a.id));
}

const TOP_FALLBACK: Record<TopList, [string, string]> = {
  airing: [AIRING, "score desc"],
  upcoming: [UPCOMING, "members desc"],
  all: ["score is not null", "score desc"],
  popular: ["", "members desc"],
  loved: ["", "favorites desc"],
  films: ["kind = 'Movie' and score is not null", "score desc"],
};

export async function getTop(list: TopList, pageNo = 1): Promise<Page<Anime>> {
  const [where, order] = TOP_FALLBACK[list];
  return pageOr(PATHS.top(list, pageNo), list === "airing" ? 3 * HOUR : DAY, () => catalogPage(where, [], order, pageNo, 25));
}
