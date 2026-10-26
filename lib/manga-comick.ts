// comick.io as a manga source — the broadest embeddable English catalogue. It's
// a public GET API (api.comick.fun), so there's NO container: we proxy it
// server-side through /api/comick/* (our Worker adds the User-Agent comick wants
// and dodges browser CORS). Page images load direct from meo.comick.pictures.
//
// Safe by construction: every call returns [] on any miss/404/block, so the
// resolver simply falls through to the other providers — comick can never break
// the reader.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Chapter } from "./manga";
import { pickMatch, searchQueries } from "./manga-match";

const API = "/api/comick";
const IMG = "https://meo.comick.pictures";
export const COMICK_PREFIX = "cmk:";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function cj(path: string): Promise<any | null> {
  try {
    const r = await fetch(API + path, { headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function comickEnglishChapters(title: string, alt?: string, extra: string[] = []): Promise<Chapter[]> {
  // Search by every name the title is known by (en / romaji / native): comick
  // and the other aggregators each index by a different one, so a single name
  // misses titles the source actually carries.
  const names = [...new Set([title, alt, ...extra].filter((s): s is string => !!s && s.trim().length > 0))];
  const searches = await Promise.all(searchQueries(names).map((q) => cj(`/v1.0/search?q=${encodeURIComponent(q)}&limit=10&t=false`)));
  const list: any[] = [];
  for (const res of searches) {
    const part: any[] = Array.isArray(res) ? res : res?.data ?? [];
    if (part.length) list.push(...part);
  }
  if (!list.length) return [];

  // Tight match against any of the names, dropping novels (comick lists light
  // novels too).
  const cands = list.map((x) => ({ x, t: norm(x?.title) })).filter((c) => c.t && !/\bnovel\b/.test(c.t));
  const match = pickMatch(cands, names);
  const slug: string | undefined = match?.x?.slug || match?.x?.hid;
  if (!slug) return [];

  const out: Chapter[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 8; page++) {
    const d = await cj(`/comic/${encodeURIComponent(slug)}/chapters?lang=en&page=${page}&limit=100`);
    const chs: any[] = d?.chapters ?? [];
    if (!chs.length) break;
    for (const c of chs) {
      const hid = c?.hid;
      if (!hid) continue;
      const num = String(c?.chap ?? "").trim();
      const key = num || hid;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `${COMICK_PREFIX}${hid}`,
        chapter: num,
        title: typeof c?.title === "string" ? c.title : "",
        volume: c?.vol != null ? String(c.vol) : null,
        pages: 0,
        group: "Cupcake",
        lang: "en",
        external: null,
      });
    }
    if (chs.length < 100) break;
  }
  out.sort((a, b) => (parseFloat(a.chapter) || 0) - (parseFloat(b.chapter) || 0));
  return out;
}

export async function comickChapterPages(encodedId: string): Promise<string[]> {
  const hid = encodedId.slice(COMICK_PREFIX.length);
  // Two shapes have shipped over time: /get_images -> [{b2key}], and the chapter
  // object -> { chapter: { md_images: [{b2key}] } }.
  let imgs: any[] = [];
  const a = await cj(`/chapter/${encodeURIComponent(hid)}/get_images`);
  imgs = Array.isArray(a) ? a : a?.images ?? [];
  if (!imgs.length) {
    const b = await cj(`/chapter/${encodeURIComponent(hid)}`);
    imgs = b?.chapter?.md_images ?? b?.md_images ?? [];
  }
  return imgs
    .map((i) => (typeof i === "string" ? i : i?.url || (i?.b2key ? `${IMG}/${i.b2key}` : null)))
    .filter((u): u is string => !!u);
}
