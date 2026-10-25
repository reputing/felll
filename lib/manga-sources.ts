// Extra manga SOURCES that have their own catalogue (unlike the MangaDex-keyed
// reader in lib/manga.ts). Each is a self-hosted Cloudflare Container, reached
// through our same-origin proxy at /api/manga-src/<source>/*. Entirely separate
// from the MangaDex path: this file is only used by the /read/<source> pages.
//
// A source is OFF until its *_API_URL var is set — the proxy then answers 503
// and the browse page shows an "isn't enabled yet" state. Adult sources also
// require an 18+ cookie (set by the age gate), which the proxy enforces.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type SourceId = "vortexscans" | "omega";

export interface SourceMeta {
  id: SourceId;
  name: string;        // shown in the UI (anonymised, like the anime providers)
  blurb: string;
  adult: boolean;
  site: string;        // used as the image Referer when proxying
}

export const SOURCES: Record<SourceId, SourceMeta> = {
  vortexscans: { id: "vortexscans", name: "VortexScans", blurb: "Action & fantasy manhwa, in English.", adult: false, site: "https://vortexscans.org" },
  omega: { id: "omega", name: "Omega", blurb: "Adult manhwa. 18+ only.", adult: true, site: "https://omegascans.org" },
};

export const isSourceId = (s: string): s is SourceId => s === "vortexscans" || s === "omega";

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
  const number = str(o?.number ?? o?.chapter ?? o?.chapterNumber ?? o?.index ?? o?.name).replace(/^chapter\s*/i, "").trim();
  return { slug, number, title: str(o?.title) };
}

// Pull a list of cards out of whatever envelope a source returns.
const cardsFrom = (src: SourceId, data: any): SrcCard[] =>
  firstArray(data?.data?.series, data?.data, data?.results, data?.series, data?.manga, data)
    .map((o) => mapCard(src, o))
    .filter((x): x is SrcCard => !!x);

// ---- public API, keyed by source ----

export async function listSource(src: SourceId, page = 1): Promise<SrcCard[]> {
  const path = src === "omega" ? `/api/v1/series?perPage=30&page=${page}` : `/api/manga?page=${page}`;
  return cardsFrom(src, await sj(src, path));
}

export async function searchSource(src: SourceId, q: string, page = 1): Promise<SrcCard[]> {
  if (!q.trim()) return listSource(src, page);
  const query = encodeURIComponent(q.trim());
  const path = src === "omega" ? `/api/v1/series?q=${query}&perPage=30&page=${page}` : `/api/manga?q=${query}&search=${query}&page=${page}`;
  return cardsFrom(src, await sj(src, path));
}

export async function sourceDetail(src: SourceId, slug: string): Promise<SrcDetail | null> {
  const s = encodeURIComponent(slug);
  if (src === "omega") {
    const d = await sj(src, `/api/v1/series/${s}?include=chapters`);
    const m = d?.data ?? d;
    if (!m) return null;
    const chapters = firstArray(m?.chapters, m?.chapterList).map(mapChapter).filter((x): x is SrcChapter => !!x);
    chapters.sort((a, b) => (parseFloat(a.number) || 0) - (parseFloat(b.number) || 0));
    return { slug, title: titleOf(m) || slug, cover: img(m?.thumbnail ?? m?.cover, SOURCES[src].site), description: str(m?.description), status: str(m?.status), chapters };
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
  const d = src === "omega"
    ? await sj(src, `/api/v1/chapter/${s}/${c}`)
    : await sj(src, `/api/chapter?slug=${s}&chapter=${c}`);
  const node = d?.data ?? d;
  const raw = firstArray(node?.images, node?.pages, node?.data, Array.isArray(node) ? node : null);
  return raw
    .map((p) => (typeof p === "string" ? p : p?.img ?? p?.url ?? p?.src ?? p?.image))
    .map((u) => img(u, SOURCES[src].site))
    .filter((x): x is string => !!x);
}
