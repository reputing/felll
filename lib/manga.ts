// MangaDex is the manga source — the clean, official, CORS-friendly API (no
// scraping), so these run straight from the browser: no Worker in the path to
// rate-limit, and chapter images load direct from the MangaDex CDN. Branded as
// "Cupcake" in the UI. Reading progress is the only thing we persist (D1).
//
// Docs: https://api.mangadex.org/docs/

const API = "https://api.mangadex.org";
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
}
export interface Chapter {
  id: string;
  chapter: string; // "12" or "12.5"
  title: string;
  volume: string | null;
  pages: number;
  group: string;
  lang: string;
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
    cover: coverUrl(m.id, m.relationships, 512),
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

/** Full detail for one title. */
export async function getManga(id: string): Promise<MangaFull | null> {
  const d = await get(`/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`).catch(() => null);
  const m = d?.data;
  if (!m) return null;
  const author = m.relationships?.find((r: Raw) => r.type === "author")?.attributes?.name ?? "";
  return {
    ...toCard(m),
    description: pick(m.attributes.description),
    altTitle: pick(m.attributes.altTitles?.find?.((a: Raw) => a.en || a.ja_ro)) || "",
    tags: (m.attributes.tags ?? []).map((t: Raw) => pick(t.attributes?.name)).filter(Boolean),
    author,
  };
}

/** Readable English chapters, de-duped to one per chapter number, in order. */
export async function getChapters(id: string): Promise<Chapter[]> {
  const out: Raw[] = [];
  for (let offset = 0; offset < 2000; offset += 500) {
    const d = await get(`/manga/${id}/feed?translatedLanguage[]=en&limit=500&offset=${offset}&order[volume]=asc&order[chapter]=asc&includes[]=scanlation_group&${RATING}`);
    out.push(...(d.data ?? []));
    if (!d.data?.length || offset + 500 >= (d.total ?? 0)) break;
  }
  const seen = new Set<string>();
  const chapters: Chapter[] = [];
  for (const c of out) {
    const a = c.attributes;
    // skip external (official-site) chapters with nothing hosted here
    if (a.externalUrl || !a.pages) continue;
    const num = String(a.chapter ?? "");
    const key = num || c.id;
    if (seen.has(key)) continue; // first scanlation group wins
    seen.add(key);
    chapters.push({
      id: c.id,
      chapter: num,
      title: a.title || "",
      volume: a.volume ?? null,
      pages: a.pages ?? 0,
      group: c.relationships?.find((r: Raw) => r.type === "scanlation_group")?.attributes?.name ?? "",
      lang: a.translatedLanguage ?? "en",
    });
  }
  return chapters;
}

/** The page image URLs for a chapter (full quality, with a data-saver fallback). */
export async function getChapterPages(chapterId: string, saver = false): Promise<string[]> {
  const d = await get(`/at-home/server/${chapterId}`);
  const base = d.baseUrl, hash = d.chapter?.hash;
  const files: string[] = (saver ? d.chapter?.dataSaver : d.chapter?.data) ?? [];
  const kind = saver ? "data-saver" : "data";
  return files.map((f) => `${base}/${kind}/${hash}/${f}`);
}

export const mangaStatusLabel = (s: string) => ({ ongoing: "Ongoing", completed: "Completed", hiatus: "Hiatus", cancelled: "Cancelled" }[s] ?? s);
