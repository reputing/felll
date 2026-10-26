// MangaDex is the manga source — the clean, official, CORS-friendly API (no
// scraping), so these run straight from the browser: no Worker in the path to
// rate-limit, and chapter images load direct from the MangaDex CDN. Branded as
// "Cupcake" in the UI. Reading progress is the only thing we persist (D1).
//
// Docs: https://api.mangadex.org/docs/

// JSON goes through our own origin (/api/md/*) to dodge MangaDex's browser CORS;
// cover + page images load straight from the CDN (an <img> needs no CORS).
import { CONSUMET_PREFIX, consumetChapterPages, consumetEnglishChapters } from "./manga-consumet";
import { COMICK_PREFIX, comickChapterPages, comickEnglishChapters } from "./manga-comick";
import { WEEB_PREFIX, weebChapterPages, weebEnglishChapters } from "./manga-weeb";

const API = "/api/md";
const UPLOADS = "https://uploads.mangadex.org";
// Keep it to non-pornographic ratings.
const RATING = "contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

export interface MangaCard {
  id: string;
  title: string;
  cover: string | null;
  year: number | null;
  status: string;
  rating: string;
}
export interface MangaFull extends MangaCard {
  description: string;
  altTitle: string;
  tags: string[];
  author: string;
  languages: string[]; // translated languages available on MangaDex
  names: string[];     // every title variant (en/romaji/native) for source search
}

const LANG_NAMES: Record<string, string> = {
  en: "English", ja: "Japanese", "ja-ro": "Japanese (rōmaji)", es: "Spanish", "es-la": "Spanish (LatAm)",
  "pt-br": "Portuguese (BR)", pt: "Portuguese", fr: "French", de: "German", it: "Italian", ru: "Russian",
  zh: "Chinese", "zh-hk": "Chinese (HK)", ko: "Korean", id: "Indonesian", tr: "Turkish", ar: "Arabic",
  th: "Thai", vi: "Vietnamese", pl: "Polish", uk: "Ukrainian", nl: "Dutch", hi: "Hindi", fil: "Filipino",
};
export const langName = (c: string) => LANG_NAMES[c] ?? c.toUpperCase();
export interface Chapter {
  id: string;
  chapter: string; // "12" or "12.5"
  title: string;
  volume: string | null;
  pages: number;
  group: string;
  lang: string;
  external: string | null; // set when the chapter is only on an official site
}

// Pick an English-ish value from MangaDex's {lang: text} maps.
const pick = (m: Raw): string => (m ? m.en || m["en-us"] || m.ja_ro || m.ja || Object.values(m)[0] || "" : "") as string;

function coverUrl(mangaId: string, rels: Raw[], size: 256 | 512 = 512): string | null {
  const f = rels?.find((r) => r.type === "cover_art")?.attributes?.fileName;
  return f ? `${UPLOADS}/covers/${mangaId}/${f}.${size}.jpg` : null;
}

// Every title a series is known by, for searching the second sources: the
// primary title (any language) plus the English, romaji and native alt titles.
// Other languages are left out — they add noise and wrong matches, not reach.
function searchNames(attrs: Raw): string[] {
  const out: string[] = [];
  const push = (v: unknown) => { if (typeof v === "string" && v.trim()) out.push(v.trim()); };
  for (const v of Object.values(attrs?.title ?? {})) push(v);
  for (const a of (attrs?.altTitles ?? []) as Raw[]) {
    push(a?.en); push(a?.["en-us"]); push(a?.["ja-ro"]); push(a?.ja_ro); push(a?.ja);
  }
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const n of out) { const k = n.toLowerCase(); if (!seen.has(k)) { seen.add(k); uniq.push(n); } }
  return uniq.slice(0, 6); // cap so we don't hammer the containers with searches
}

function toCard(m: Raw): MangaCard {
  return {
    id: m.id,
    title: pick(m.attributes.title) || pick(m.attributes.altTitles?.find?.((a: Raw) => a.en)) || "Untitled",
    cover: coverUrl(m.id, m.relationships, 256),
    year: m.attributes.year ?? null,
    status: m.attributes.status ?? "",
    rating: m.attributes.contentRating ?? "",
  };
}

async function get(path: string): Promise<Raw> {
  const res = await fetch(API + path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`MangaDex ${res.status}`);
  return res.json();
}

/** Popular manga (most followed), for the browse landing. */
export async function popularManga(limit = 30, offset = 0): Promise<MangaCard[]> {
  const d = await get(`/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&${RATING}&order[followedCount]=desc&hasAvailableChapters=true`);
  return (d.data ?? []).map(toCard);
}

/** Title search. */
export async function searchManga(q: string, limit = 30): Promise<MangaCard[]> {
  if (!q.trim()) return popularManga(limit);
  const d = await get(`/manga?title=${encodeURIComponent(q.trim())}&limit=${limit}&includes[]=cover_art&${RATING}&order[relevance]=desc&hasAvailableChapters=true`);
  return (d.data ?? []).map(toCard);
}

export interface BrowseParams {
  q?: string;
  tag?: string;          // a genre tag id
  status?: string;       // ongoing | completed | hiatus | cancelled
  demographic?: string;  // shounen | shoujo | seinen | josei
  year?: string;
  order?: string;        // popular | latest | rating | newest | title
  limit?: number;
  offset?: number;
}

const ORDER: Record<string, string> = {
  popular: "order[followedCount]=desc",
  latest: "order[latestUploadedChapter]=desc",
  rating: "order[rating]=desc",
  newest: "order[year]=desc",
  title: "order[title]=asc",
};

/** Filtered browse → cards plus the total count MangaDex reports. */
export async function browseManga(p: BrowseParams): Promise<{ items: MangaCard[]; total: number }> {
  const qs = [`limit=${p.limit ?? 36}`, `offset=${p.offset ?? 0}`, "includes[]=cover_art", RATING, "hasAvailableChapters=true"];
  if (p.q?.trim()) qs.push(`title=${encodeURIComponent(p.q.trim())}`);
  if (p.tag) qs.push(`includedTags[]=${p.tag}`);
  if (p.status) qs.push(`status[]=${p.status}`);
  if (p.demographic) qs.push(`publicationDemographic[]=${p.demographic}`);
  if (p.year && /^\d{4}$/.test(p.year)) qs.push(`year=${p.year}`);
  qs.push(ORDER[p.order || (p.q?.trim() ? "" : "popular")] || (p.q?.trim() ? "order[relevance]=desc" : ORDER.popular));
  const d = await get(`/manga?${qs.join("&")}`);
  return { items: (d.data ?? []).map(toCard), total: d.total ?? 0 };
}

export interface MangaTag { id: string; name: string }
let tagCache: MangaTag[] | null = null;
/** The genre tags, for the filter dropdown (cached per session). */
export async function getMangaTags(): Promise<MangaTag[]> {
  if (tagCache) return tagCache;
  try {
    const d = await get(`/manga/tag`);
    tagCache = (d.data ?? [])
      .filter((t: Raw) => t.attributes?.group === "genre")
      .map((t: Raw) => ({ id: t.id, name: pick(t.attributes.name) }))
      .sort((a: MangaTag, b: MangaTag) => a.name.localeCompare(b.name));
  } catch {
    tagCache = [];
  }
  return tagCache!;
}

// getManga and getChapters are hit repeatedly as the reader moves between
// chapters, so memoise them per title for the browser session (a rejected
// fetch is evicted so it can be retried). getChapterPages is never cached: its
// at-home URLs carry short-lived tokens.
const mangaCache = new Map<string, Promise<MangaFull | null>>();
const chaptersCache = new Map<string, Promise<Chapter[]>>();

/** Full detail for one title (memoised per session). */
export function getManga(id: string): Promise<MangaFull | null> {
  let p = mangaCache.get(id);
  if (!p) {
    p = fetchManga(id).catch((e) => { mangaCache.delete(id); throw e; });
    mangaCache.set(id, p);
  }
  return p;
}
async function fetchManga(id: string): Promise<MangaFull | null> {
  const d = await get(`/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`).catch(() => null);
  const m = d?.data;
  if (!m) return null;
  const author = m.relationships?.find((r: Raw) => r.type === "author")?.attributes?.name ?? "";
  return {
    ...toCard(m),
    cover: coverUrl(m.id, m.relationships, 512), // the detail hero wants the larger cover
    description: pick(m.attributes.description),
    altTitle: pick(m.attributes.altTitles?.find?.((a: Raw) => a.en || a.ja_ro)) || "",
    tags: (m.attributes.tags ?? []).map((t: Raw) => pick(t.attributes?.name)).filter(Boolean),
    author,
    languages: (m.attributes.availableTranslatedLanguages ?? []).filter((l: unknown): l is string => typeof l === "string"),
    names: searchNames(m.attributes),
  };
}

async function fetchFeed(id: string, extraQs: string): Promise<Raw[]> {
  const out: Raw[] = [];
  for (let offset = 0; offset < 2000; offset += 500) {
    const d = await get(`/manga/${id}/feed?limit=500&offset=${offset}&order[volume]=asc&order[chapter]=asc&includes[]=scanlation_group&${RATING}${extraQs}`);
    out.push(...(d.data ?? []));
    if (!d.data?.length || offset + 500 >= (d.total ?? 0)) break;
  }
  return out;
}

// Build readable (or, when asked, external-only) chapters from a raw feed,
// de-duped to one per chapter number, keeping the first scanlation group.
function buildChapters(raw: Raw[], external = false): Chapter[] {
  const seen = new Set<string>();
  const chapters: Chapter[] = [];
  for (const c of raw) {
    const a = c.attributes;
    const isExternal = !!a.externalUrl;
    if (external ? !isExternal : isExternal || !a.pages) continue;
    const num = String(a.chapter ?? "");
    const key = num || c.id;
    if (seen.has(key)) continue;
    seen.add(key);
    chapters.push({
      id: c.id,
      chapter: num,
      title: a.title || "",
      volume: a.volume ?? null,
      pages: a.pages ?? 0,
      group: c.relationships?.find((r: Raw) => r.type === "scanlation_group")?.attributes?.name ?? "",
      lang: a.translatedLanguage ?? "en",
      external: isExternal ? a.externalUrl : null,
    });
  }
  return chapters;
}

const chKey = (id: string, lang?: string) => `${id}|${lang || "auto"}`;
// Resolving a title's chapters means hitting MangaDex plus a scraper container
// (for licensed manhwa), a multi-second waterfall. The in-memory cache above is
// wiped on every full page load, so persist the resolved list to localStorage
// too: the detail/reader paint it instantly on a revisit while a fresh fetch
// revalidates in the background.
const CH_STORE = (key: string) => `cupcake:chs:${key}`;
export function cachedChapters(id: string, lang?: string): Chapter[] | null {
  try {
    const raw = localStorage.getItem(CH_STORE(chKey(id, lang)));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v?.chs) && v.chs.length ? (v.chs as Chapter[]) : null;
  } catch {
    return null;
  }
}
function storeChapters(key: string, chs: Chapter[]): void {
  if (!chs.length) return;
  // Never cache the all-external "read on official site" fallback: it's what we
  // return when the second sources miss, which can be a transient container
  // cold-start. Caching it would make that miss stick on the next visit instead
  // of re-resolving to the readable source once it's back up.
  if (chs.every((c) => c.external)) return;
  try {
    localStorage.setItem(CH_STORE(key), JSON.stringify({ at: Date.now(), chs }));
  } catch {
    /* storage off or full — fine, it's only a speed-up */
  }
}

/** Readable chapters for a title, in `lang` (memoised per session). When no
 *  language is asked for, English first; if none is hosted here, fall back to
 *  the language with the most chapters, and failing that surface the
 *  official/external links, so a popular title is never shown as empty. */
export function getChapters(id: string, lang?: string): Promise<Chapter[]> {
  const key = chKey(id, lang);
  let p = chaptersCache.get(key);
  if (!p) {
    p = fetchChapters(id, lang).then((chs) => { storeChapters(key, chs); return chs; }).catch((e) => { chaptersCache.delete(key); throw e; });
    chaptersCache.set(key, p);
  }
  return p;
}
async function fetchChapters(id: string, lang?: string): Promise<Chapter[]> {
  // A specific NON-English language was chosen → use it directly when hosted.
  // English always runs the full resolution below: a partial English upload on
  // MangaDex must NOT pre-empt the fuller second-source run. (Blue Lock has one
  // stray readable English chapter here but ~280 on weebcentral — returning the
  // single MangaDex chapter was the "only 1 chapter" bug.)
  if (lang && lang !== "en") {
    const chosen = buildChapters(await fetchFeed(id, `&translatedLanguage[]=${encodeURIComponent(lang)}`));
    if (chosen.length) return chosen;
    // nothing hosted in that language → fall through to the English resolution
  }
  // English, as strongly as possible. A COMPLETE English run on MangaDex (one
  // that includes the early chapters) wins outright.
  const enFeed = await fetchFeed(id, "&translatedLanguage[]=en");
  const enHosted = buildChapters(enFeed);
  if (enHosted.length && startsEarly(enHosted)) return enHosted;

  // Otherwise reach for the second source (Consumet), which usually carries the
  // full series readable in-app. This covers two cases the reader hates:
  //  - English exists only as external official links (webnovel/mangaplus) — we
  //    embed Consumet's pages instead of bouncing the reader to another site.
  //  - MangaDex's English is a sparse partial upload missing the early chapters.
  // No-op when the provider isn't configured (proxy 503 → we fall through).
  let second: Chapter[] = [];
  const m = await getManga(id).catch(() => null);
  if (m) {
    // comick.io first (broadest English), then the Consumet providers. Each is
    // independently guarded so one failing never skips the other.
    // weebcentral (container) is the most reliable for licensed manhwa WITH
    // pages; then comick.io; then the Consumet providers.
    second = await weebEnglishChapters(m.title, m.altTitle, m.names).catch(() => []);
    if (!second.length) second = await comickEnglishChapters(m.title, m.altTitle, m.names).catch(() => []);
    if (!second.length) second = await consumetEnglishChapters(m.title, m.altTitle, m.names).catch(() => []);
  }
  if (second.length && second.length >= enHosted.length) return second;
  if (enHosted.length) return enHosted; // keep MangaDex's partial run over nothing

  // No readable English anywhere → surface the official/external English links.
  const enExternal = buildChapters(enFeed, true);
  if (enExternal.length) return enExternal;

  // No English at all. Fall back to the language with the most readable
  // chapters, and failing that any official/external links.
  const all = await fetchFeed(id, "");
  const byLang = new Map<string, Raw[]>();
  for (const c of all) {
    if (c.attributes.externalUrl || !c.attributes.pages) continue;
    const l = c.attributes.translatedLanguage ?? "";
    const arr = byLang.get(l);
    if (arr) arr.push(c); else byLang.set(l, [c]);
  }
  let best: Raw[] = [];
  for (const arr of byLang.values()) if (arr.length > best.length) best = arr;
  const bestChapters = buildChapters(best);
  if (bestChapters.length) return bestChapters;

  return buildChapters(all, true);
}

// Does this run include the early chapters, or is it a partial upload that
// starts absurdly high (e.g. only chapters 74+)? Oneshots (no chapter numbers)
// count as complete.
function startsEarly(chs: Chapter[]): boolean {
  let min = Infinity;
  for (const c of chs) {
    const n = parseFloat(c.chapter);
    if (Number.isFinite(n) && n < min) min = n;
  }
  return !Number.isFinite(min) || min <= 3;
}

// The second sources (weeb/comick/consumet) are scraper containers that scale to
// zero, so a cold start or a flaky upstream node can return empty on the first
// try even when the chapter's pages exist and are reachable. Retry a few times,
// backing off, before giving up — otherwise the reader dead-ends on "no readable
// pages here" for a chapter that is actually fine. Safe: a genuinely empty
// chapter still ends up [], just a few seconds slower in that rare case.
// A chapter id can reach us percent-encoded from the URL (the "wc:"/"cm:" source
// prefix's colon becomes "%3A"). Decode it so prefix checks and list lookups
// match; a plain MangaDex uuid has no escapes, so this is a no-op for those.
export function safeDecode(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

async function withRetry(fn: () => Promise<string[]>, tries = 4): Promise<string[]> {
  for (let i = 0; i < tries; i++) {
    try {
      const pages = await fn();
      if (pages.length) return pages;
    } catch {
      /* fall through to the backoff + retry */
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return [];
}

/** The page image URLs for a chapter (full quality, with a data-saver fallback). */
export async function getChapterPages(rawChapterId: string, saver = false, tries = 4): Promise<string[]> {
  // The id can arrive percent-encoded from the URL (Next's <Link> turns the "wc:"
  // / "cm:" source prefix's colon into "%3A"), which would skip the prefix checks
  // below and wrongly route a second-source chapter to MangaDex (→ 404 → empty).
  // Decode first so "wc%3A…" is recognised as "wc:…".
  const chapterId = safeDecode(rawChapterId);
  // Chapters from a second source carry a tag → read their pages from it. `tries`
  // lets a thumbnail fetch ask for a single attempt (no retry storm on scroll).
  if (chapterId.startsWith(WEEB_PREFIX)) return withRetry(() => weebChapterPages(chapterId), tries);
  if (chapterId.startsWith(COMICK_PREFIX)) return withRetry(() => comickChapterPages(chapterId), tries);
  if (chapterId.startsWith(CONSUMET_PREFIX)) return withRetry(() => consumetChapterPages(chapterId), tries);
  const d = await get(`/at-home/server/${chapterId}`);
  const base = d.baseUrl, hash = d.chapter?.hash;
  const files: string[] = (saver ? d.chapter?.dataSaver : d.chapter?.data) ?? [];
  const kind = saver ? "data-saver" : "data";
  return files.map((f) => `${base}/${kind}/${hash}/${f}`);
}

// The first page image of a chapter, for a chapter-list thumbnail. Memoised per
// session (and deduped) so a given chapter is resolved at most once, however
// many times a row scrolls in and out of view.
const thumbCache = new Map<string, Promise<string | null>>();
export function getChapterThumb(chapterId: string): Promise<string | null> {
  const id = safeDecode(chapterId);
  let p = thumbCache.get(id);
  if (!p) {
    p = getChapterPages(id, false, 1).then((pages) => pages[0] ?? null).catch(() => null);
    thumbCache.set(id, p);
  }
  return p;
}

export const mangaStatusLabel = (s: string) => ({ ongoing: "Ongoing", completed: "Completed", hiatus: "Hiatus", cancelled: "Cancelled" }[s] ?? s);
