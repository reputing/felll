// weebcentral (via the comick-source-api container) — reliably carries licensed
// manhwa (Solo Leveling etc.) WITH readable pages. POST search/chapters; pages
// come from the chapter HTML (proxy/html) which embeds the image URLs. Safe:
// every call returns [] on any miss, so the resolver falls through.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Chapter } from "./manga";

const API = "/api/weeb";
const SOURCE = "weebcentral";
export const WEEB_PREFIX = "wc:";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function post(path: string, body: any): Promise<any | null> {
  try {
    const r = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
// weebcentral chapter URLs are https://weebcentral.com/chapters/<ULID>, and the
// ULID is alphanumeric (URL-path-safe), so store it raw — base64 in a path
// segment was getting mangled and corrupting the URL.
const WEEB_BASE = "https://weebcentral.com/chapters/";
const ulidOf = (url: string) => (url.split(/[?#]/)[0].split("/").filter(Boolean).pop() || "");

export async function weebEnglishChapters(title: string, alt?: string): Promise<Chapter[]> {
  const want = norm(title);
  const wantAlt = alt ? norm(alt) : "";
  const queries = [...new Set([title, alt].filter((s): s is string => !!s && !!s.trim()))];
  // Fire the title + alt-title searches at once rather than one-then-the-other:
  // the container round trip is the slow part, so overlapping them halves the
  // wait when the first query doesn't match. Matching still prefers the first
  // query's results (queries/searches stay in order).
  const searches = await Promise.all(queries.map((q) => post("/api/search", { query: q, source: SOURCE })));
  let url = "";
  for (const s of searches) {
    const results: any[] = s?.results ?? [];
    if (!results.length) continue;
    const cands = results.map((r) => ({ r, t: norm(r?.title) })).filter((x) => x.t && !/\bnovel\b/.test(x.t));
    const near = (t: string) => (t.includes(want) || want.includes(t)) && Math.abs(t.length - want.length) <= 6;
    const m =
      cands.find((x) => x.t === want) ||
      cands.find((x) => wantAlt && x.t === wantAlt) ||
      cands.find((x) => x.t.startsWith(want) || want.startsWith(x.t)) ||
      cands.find((x) => near(x.t));
    if (m?.r?.url) { url = m.r.url; break; }
  }
  if (!url) return [];

  const d = await post("/api/chapters", { url, source: SOURCE });
  const raw: any[] = d?.chapters ?? [];
  if (!raw.length) return [];
  const out: Chapter[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    const curl = c?.url;
    if (!curl) continue;
    const num = String(c?.number ?? c?.id ?? "").trim();
    const key = num || curl;
    if (seen.has(key)) continue;
    seen.add(key);
    const ulid = ulidOf(curl);
    if (!ulid) continue;
    out.push({ id: `${WEEB_PREFIX}${ulid}`, chapter: num, title: typeof c?.title === "string" ? c.title : "", volume: null, pages: 0, group: "Cupcake", lang: "en", external: null });
  }
  out.sort((a, b) => (parseFloat(a.chapter) || 0) - (parseFloat(b.chapter) || 0));
  return out;
}

export async function weebChapterPages(encodedId: string): Promise<string[]> {
  const ulid = encodedId.slice(WEEB_PREFIX.length);
  if (!ulid) return [];
  // weebcentral loads the pages from a separate /images endpoint (the bare
  // chapter page only has the first image), so fetch that.
  const imagesUrl = `${WEEB_BASE}${ulid}/images?is_prev=False&current_page=1&reading_style=long_strip`;
  let html = "";
  try {
    const r = await fetch(`${API}/api/proxy/html?url=${encodeURIComponent(imagesUrl)}`);
    if (r.ok) html = await r.text();
  } catch {
    return [];
  }
  // Page images live on the manga CDN (…/manga/<Title>/<chapter>-<page>.<ext>);
  // the cover fallback (compsci88) is excluded.
  const urls = html.match(/https?:\/\/[^"'\s<>\\]+\.(?:png|jpe?g|webp)/gi) || [];
  const pages = [...new Set(urls)].filter((u) => /\/manga\//i.test(u) && !/compsci88|\/cover\//i.test(u));
  // Route through the image proxy with a weebcentral referer, in case the CDN checks it.
  return pages.map((u) => `/api/manga-img?u=${encodeURIComponent(u)}&r=${encodeURIComponent("https://weebcentral.com")}`);
}
