// A SECOND manga source, for the rare title MangaDex has no English for at all
// (not even official links). Talks to a self-hosted Consumet API — a Cloudflare
// Container, same pattern as the Anivexa anime bot — through our same-origin
// proxy at /api/consumet/*.
//
// Entirely optional and OFF by default: when the CONSUMET_API_URL var is unset
// the proxy answers 503 and the reader falls straight back to MangaDex, so the
// live site is unchanged until a container is deployed. The upstream provider is
// anonymised in the UI (branded "Cupcake"), like the anime providers.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Chapter } from "./manga";
import { pickMatch, searchQueries } from "./manga-match";

const API = "/api/consumet";
// Chapter ids from this source are tagged so getChapterPages knows to read them
// from Consumet instead of MangaDex's at-home servers.
export const CONSUMET_PREFIX = "cmgr:";
// English-strong sources, tried in order until one hits. ComicK (comick.io) has
// the broadest embeddable English catalogue, so it leads; the others are
// fallbacks (and cover ComicK if the container build predates that provider).
const PROVIDERS = ["comick", "mangapill", "mangahere", "mangakakalot"];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const titleOf = (t: unknown): string =>
  typeof t === "string" ? t : t && typeof t === "object" ? (t as any).english || (t as any).romaji || (t as any).native || "" : "";

// 503 means the provider isn't configured — the caller stops immediately so the
// disabled path costs one quick request, not one per provider.
class ProviderOff extends Error {}
async function cj(path: string): Promise<any | null> {
  let r: Response;
  try {
    r = await fetch(API + path, { headers: { accept: "application/json" } });
  } catch {
    return null;
  }
  if (r.status === 503) throw new ProviderOff();
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

// base64url, so a provider's chapter id survives a URL path segment.
function encodeId(provider: string, chapterId: string): string {
  const b64 = btoa(unescape(encodeURIComponent(chapterId))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${CONSUMET_PREFIX}${provider}:${b64}`;
}
export function decodeConsumetId(id: string): { provider: string; chapterId: string } | null {
  if (!id.startsWith(CONSUMET_PREFIX)) return null;
  const rest = id.slice(CONSUMET_PREFIX.length);
  const i = rest.indexOf(":");
  if (i < 0) return null;
  const provider = rest.slice(0, i);
  let b64 = rest.slice(i + 1).replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  try {
    return { provider, chapterId: decodeURIComponent(escape(atob(b64))) };
  } catch {
    return null;
  }
}

interface CChapter {
  id?: string;
  title?: unknown;
  chapterNumber?: string | number;
  chapter?: string | number;
  volumeNumber?: string | number;
  volume?: string | number;
  pages?: number;
}

/** English chapters for a title from the first Consumet provider that has it
 *  with a confident title match. Empty when the provider is off or has no match. */
export async function consumetEnglishChapters(title: string, alt?: string, extra: string[] = []): Promise<Chapter[]> {
  // Search by every name the title is known by (en / romaji / native); each
  // provider indexes by a different one, so a single name misses titles they
  // actually carry.
  const names = [...new Set([title, alt, ...extra].filter((s): s is string => !!s && s.trim().length > 0))];
  try {
    return await searchProviders(names);
  } catch {
    // ProviderOff (not configured) or any transient error → no second source.
    return [];
  }
}

async function searchProviders(names: string[]): Promise<Chapter[]> {
  const wantsNovel = names.some((n) => /\bnovel\b/.test(norm(n)));
  const queries = searchQueries(names);
  for (const provider of PROVIDERS) {
    for (const query of queries) {
    const search = await cj(`/manga/${provider}/${encodeURIComponent(query)}`);
    const results: { id?: string; title?: unknown }[] = search?.results ?? [];
    if (!results.length) continue;
    // Match tightly against any of the names, or we pick the wrong entry — e.g.
    // "Solo Leveling" search returns the light NOVEL first, which has no readable
    // manga pages. Drop novel results (unless the title itself is a novel).
    const cands = results
      .map((r) => ({ r, raw: titleOf(r.title) }))
      .filter((x) => x.raw && (wantsNovel || !/\bnovel\b/i.test(x.raw)));
    const match = pickMatch(cands, names)?.r ?? null;
    if (!match?.id) continue;

    const info = await cj(`/manga/${provider}/info?id=${encodeURIComponent(match.id)}`);
    const raw: CChapter[] = info?.chapters ?? [];
    if (!raw.length) continue;

    const chapters: Chapter[] = [];
    const seen = new Set<string>();
    for (const c of raw) {
      if (!c.id) continue;
      const num = String(c.chapterNumber ?? c.chapter ?? "").replace(/^chapter\s*/i, "").trim();
      const key = num || c.id;
      if (seen.has(key)) continue;
      seen.add(key);
      chapters.push({
        id: encodeId(provider, c.id),
        chapter: num,
        title: typeof c.title === "string" ? c.title : "",
        volume: (c.volumeNumber ?? c.volume) != null ? String(c.volumeNumber ?? c.volume) : null,
        pages: typeof c.pages === "number" ? c.pages : 0,
        group: "Cupcake",
        lang: "en",
        external: null,
      });
    }
    // Consumet tends to return newest-first; our reader wants chapter 1 at the top.
    chapters.sort((a, b) => (parseFloat(a.chapter) || 0) - (parseFloat(b.chapter) || 0));
    if (chapters.length) return chapters;
    }
  }
  return [];
}

interface CPage {
  page?: number;
  img?: string;
  url?: string;
  headerForImage?: Record<string, string>;
  header?: Record<string, string>;
}

/** Page image URLs for a Consumet chapter, each routed through our image proxy
 *  (manga CDNs often need a Referer an <img> can't send). */
export async function consumetChapterPages(encodedId: string): Promise<string[]> {
  const d = decodeConsumetId(encodedId);
  if (!d) return [];
  const data = await cj(`/manga/${d.provider}/read?chapterId=${encodeURIComponent(d.chapterId)}`).catch(() => null);
  const pages: CPage[] = Array.isArray(data) ? data : data?.pages ?? data?.images ?? [];
  return pages
    .map((p) => {
      const u = p.img || p.url;
      if (!u) return null;
      const headers = p.headerForImage || p.header;
      const h = headers && Object.keys(headers).length ? `&h=${encodeURIComponent(JSON.stringify(headers))}` : "";
      return `${API}/img?u=${encodeURIComponent(u)}${h}`;
    })
    .filter((x): x is string => !!x);
}
