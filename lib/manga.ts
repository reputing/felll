// MangaDex is the manga source — the clean, official, CORS-friendly API (no
// scraping), so these run straight from the browser: no Worker in the path to
// rate-limit, and chapter images load direct from the MangaDex CDN. Branded as
// "Cupcake" in the UI. Reading progress is the only thing we persist (D1).
//
// Docs: https://api.mangadex.org/docs/

// JSON goes through our own origin (/api/md/*) to dodge MangaDex's browser CORS;
// cover + page images load straight from the CDN (an <img> needs no CORS).
import { CONSUMET_PREFIX, consumetChapterPages, consumetEnglishChapters } from "./manga-consumet";

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

/** Readable chapters for a title, in `lang` (memoised per session). When no
 *  language is asked for, English first; if none is hosted here, fall back to
 *  the language with the most chapters, and failing that surface the
 *  official/external links, so a popular title is never shown as empty. */
export function getChapters(id: string, lang?: string): Promise<Chapter[]> {
  const key = `${id}|${lang || "auto"}`;
  let p = chaptersCache.get(key);
  if (!p) {
    p = fetchChapters(id, lang).catch((e) => { chaptersCache.delete(key); throw e; });
    chaptersCache.set(key, p);
  }
  return p;
}
async function fetchChapters(id: string, lang?: string): Promise<Chapter[]> {
  // A specific language was chosen (reader/detail language picker).
  if (lang) {
    const chosen = buildChapters(await fetchFeed(id, `&translatedLanguage[]=${encodeURIComponent(lang)}`));
    if (chosen.length) return chosen;
    // nothing hosted in that language → fall through to the default resolution
  }
  // English by default, as strongly as possible: hosted English first, then
  // English official/external links — we'd rather show English links than dump
  // the reader into Italian/Spanish/etc. for a title that's popular in English.
  const enFeed = await fetchFeed(id, "&translatedLanguage[]=en");
  const enHosted = buildChapters(enFeed);
  if (enHosted.length) return enHosted;
  const enExternal = buildChapters(enFeed, true);
  if (enExternal.length) return enExternal;

  // Still no English on MangaDex. Before dropping the reader into another
  // language, try the second English source (the Consumet container). This is a
  // no-op when that provider isn't configured — the proxy answers 503 and we
  // fall through. We need the title to search it, so pull the (memoised) detail.
  try {
    const m = await getManga(id);
    if (m) {
      const chs = await consumetEnglishChapters(m.title, m.altTitle);
      if (chs.length) return chs;
    }
  } catch {
    /* provider off or a miss → MangaDex fallbacks below */
  }

  // No English anywhere. Fall back to the language with the most readable
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

/** The page image URLs for a chapter (full quality, with a data-saver fallback). */
export async function getChapterPages(chapterId: string, saver = false): Promise<string[]> {
  // Chapters from the second source carry a tag → read them from Consumet.
  if (chapterId.startsWith(CONSUMET_PREFIX)) return consumetChapterPages(chapterId);
  const d = await get(`/at-home/server/${chapterId}`);
  const base = d.baseUrl, hash = d.chapter?.hash;
  const files: string[] = (saver ? d.chapter?.dataSaver : d.chapter?.data) ?? [];
  const kind = saver ? "data-saver" : "data";
  return files.map((f) => `${base}/${kind}/${hash}/${f}`);
}

export const mangaStatusLabel = (s: string) => ({ ongoing: "Ongoing", completed: "Completed", hiatus: "Hiatus", cancelled: "Cancelled" }[s] ?? s);
