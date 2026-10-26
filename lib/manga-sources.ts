// Extra manga SOURCES that have their own catalogue (unlike the MangaDex-keyed
// reader in lib/manga.ts). Each is a self-hosted Cloudflare Container, reached
// through our same-origin proxy at /api/manga-src/<source>/*. Entirely separate
// from the MangaDex path: this file is only used by the /read/<source> pages.
//
// A source is OFF until its *_API_URL var is set — the proxy then answers 503
// and the browse page shows an "isn't enabled yet" state. Adult sources also
// require an 18+ cookie (set by the age gate), which the proxy enforces.
/* eslint-disable @typescript-eslint/no-explicit-any */

// Omega (omegascans, adult manhwa) used to live here. It was an unreliable
// scraper container, and adult manhwa now lives in the main MangaDex reader
// (lib/manga.ts) — read fully in-app from MangaDex's own CDN, no extra
// container, no redirect. `doujin` (jandapress → nhentai + other doujin sites)
// is the adult own-catalogue source that replaced it; deploy jandapress-server/
// and point DOUJIN_API_URL at it (see MANGA-PROVIDERS.md).
export type SourceId = "vortexscans" | "doujin";

export interface SourceMeta {
  id: SourceId;
  name: string;         // shown in the UI (anonymised, like the anime providers)
  blurb: string;
  kind: string;         // content-kind label on the detail hero ("Manhwa", "Doujin")
  adult: boolean;
  site: string;         // used as the image Referer when proxying
  searchFirst?: boolean; // source has no plain listing — the browse starts from a search
}

export const SOURCES: Record<SourceId, SourceMeta> = {
  vortexscans: { id: "vortexscans", name: "VortexScans", blurb: "Action & fantasy manhwa, in English.", kind: "Manhwa", adult: false, site: "https://vortexscans.org" },
  doujin: { id: "doujin", name: "Doujin", blurb: "Doujinshi. 18+ only.", kind: "Doujin", adult: true, site: "https://nhentai.net", searchFirst: true },
};

export const isSourceId = (s: string): s is SourceId => s === "vortexscans" || s === "doujin";

export interface SrcCard { slug: string; title: string; cover: string | null }
export interface SrcChapter { slug: string; number: string; title: string }
export interface SrcDetail {
  slug: string;
  title: string;
  cover: string | null;
  description: string;
  status: string;
  chapters: SrcChapter[];
}

const API = "/api/manga-src";

async function sj(src: SourceId, path: string): Promise<any | null> {
  try {
    const r = await fetch(`${API}/${src}${path}`, { headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Route a source image through our proxy so a Referer the CDN wants can be sent.
function img(u: string | null | undefined, referer: string): string | null {
  if (!u || typeof u !== "string") return null;
  if (!/^https?:\/\//.test(u)) return null;
  return `/api/manga-img?u=${encodeURIComponent(u)}&r=${encodeURIComponent(referer)}`;
}

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
// First of several fields that is actually non-empty (an empty string must not
// win a ?? chain — some sources send index:"" with the number in name:"Chapter 5").
const firstStr = (...vals: unknown[]): string => {
  for (const v of vals) { const s = str(v).trim(); if (s) return s; }
  return "";
};
const firstArray = (...cands: unknown[]): any[] => {
  for (const c of cands) if (Array.isArray(c)) return c;
  return [];
};
const titleOf = (o: any): string => str(o?.title) || str(o?.name) || str(o?.series);

// ---- per-source field mapping (defensive: field names vary across builds) ----

function mapCard(src: SourceId, o: any): SrcCard | null {
  const slug = str(o?.slug) || str(o?.id) || (typeof o?.url === "string" ? o.url.split("/").filter(Boolean).pop() : "");
  const title = titleOf(o);
  if (!slug || !title) return null;
  const rawCover = o?.cover ?? o?.thumbnail ?? o?.image ?? o?.poster ?? o?.coverImage ?? null;
  return { slug, title, cover: img(rawCover, SOURCES[src].site) };
}

function mapChapter(o: any): SrcChapter | null {
  const slug = str(o?.slug) || str(o?.id) || str(o?.chapterSlug) || (typeof o?.url === "string" ? o.url.split("/").filter(Boolean).pop() : "");
  if (!slug) return null;
  const number = firstStr(o?.number, o?.chapter, o?.chapterNumber, o?.index, o?.name).replace(/^chapter\s*/i, "").trim();
  return { slug, number, title: str(o?.title) };
}

// Pull a list of cards out of whatever envelope a source returns.
const cardsFrom = (src: SourceId, data: any): SrcCard[] =>
  firstArray(data?.data?.series, data?.data, data?.results, data?.series, data?.manga, data)
    .map((o) => mapCard(src, o))
    .filter((x): x is SrcCard => !!x);

// ---- doujin (jandapress / nhentai) — a different shape from the manhwa sources:
// titles are {english,japanese,pretty} objects, each gallery is a single book
// (no chapter list), and page images are a flat `image` array of full URLs. ----

// A gallery title is a string on `get` (the pretty title) and an object on
// `search`; accept both.
const doujinTitle = (t: any, fallback: string): string =>
  (typeof t === "string" && t.trim() ? t.trim() : str(t?.pretty) || str(t?.english) || str(t?.japanese)) || fallback;

function mapDoujinCard(o: any): SrcCard | null {
  const slug = str(o?.id);
  const title = doujinTitle(o?.title, "");
  if (!slug || !title) return null;
  const rawCover = o?.cover ?? o?.thumbnail ?? o?.image ?? null;
  return { slug, title, cover: img(typeof rawCover === "string" ? rawCover : null, SOURCES.doujin.site) };
}

const doujinCards = (data: any): SrcCard[] =>
  firstArray(data?.data).map(mapDoujinCard).filter((x): x is SrcCard => !!x);

// ---- public API, keyed by source ----

export async function listSource(src: SourceId, page = 1): Promise<SrcCard[]> {
  if (src === "doujin") return []; // search-first: nhentai has no plain listing
  return cardsFrom(src, await sj(src, `/api/manga?page=${page}`));
}

export async function searchSource(src: SourceId, q: string, page = 1): Promise<SrcCard[]> {
  if (!q.trim()) return listSource(src, page);
  const query = encodeURIComponent(q.trim());
  if (src === "doujin") return doujinCards(await sj(src, `/nhentai/search?key=${query}&page=${page}&sort=popular`));
  return cardsFrom(src, await sj(src, `/api/manga?q=${query}&search=${query}&page=${page}`));
}

export async function sourceDetail(src: SourceId, slug: string): Promise<SrcDetail | null> {
  const s = encodeURIComponent(slug);
  if (src === "doujin") {
    // One gallery = one book, so it maps onto the reader as a single chapter.
    const d = await sj(src, `/nhentai/get?book=${s}`);
    const m = d?.data ?? d;
    if (!m) return null;
    const images = firstArray(m?.image, m?.images).map(str).filter(Boolean);
    const tags = firstArray(m?.tags).map(str).filter(Boolean);
    const pages = typeof m?.num_pages === "number" ? m.num_pages : images.length || parseFloat(str(m?.total)) || 0;
    return {
      slug,
      title: doujinTitle(m?.title, slug),
      cover: img(images[0] ?? null, SOURCES.doujin.site),
      description: tags.length ? `tags: ${tags.join(", ")}` : "",
      status: pages ? `${pages} pages` : "",
      chapters: [{ slug, number: "", title: "Read" }],
    };
  }
  // vortexscans: detail + chapters are separate calls
  const d = await sj(src, `/api/manga?slug=${s}`);
  const m = d?.data ?? d;
  if (!m) return null;
  const ch = await sj(src, `/api/manga?slug=${s}&action=chapters&perPage=2000&limit=2000`);
  const chapters = firstArray(ch?.data?.chapters, ch?.data, ch?.chapters, ch).map(mapChapter).filter((x): x is SrcChapter => !!x);
  chapters.sort((a, b) => (parseFloat(a.number) || 0) - (parseFloat(b.number) || 0));
  return { slug, title: titleOf(m) || slug, cover: img(m?.cover ?? m?.thumbnail ?? m?.image, SOURCES[src].site), description: str(m?.description), status: str(m?.status), chapters };
}

export async function sourcePages(src: SourceId, slug: string, chapterSlug: string): Promise<string[]> {
  const s = encodeURIComponent(slug), c = encodeURIComponent(chapterSlug);
  if (src === "doujin") {
    // The gallery is the book; chapterSlug == slug. Pages are a flat `image` array.
    const d = await sj(src, `/nhentai/get?book=${s}`);
    const node = d?.data ?? d;
    return firstArray(node?.image, node?.images)
      .map(str)
      .filter(Boolean)
      .map((u) => img(u, SOURCES.doujin.site))
      .filter((x): x is string => !!x);
  }
  const d = await sj(src, `/api/chapter?slug=${s}&chapter=${c}`);
  const node = d?.data ?? d;
  const raw = firstArray(node?.images, node?.pages, node?.data, Array.isArray(node) ? node : null);
  return raw
    .map((p) => (typeof p === "string" ? p : p?.img ?? p?.url ?? p?.src ?? p?.image))
    .map((u) => img(u, SOURCES[src].site))
    .filter((x): x is string => !!x);
}
