// Which URLs a manga page image is tried from, in order. Pure, so the order (the
// part that decides whether a flaky CDN node blanks a page) can be tested.

export interface ChainOpts {
  n: number;            // page index
  src: string;          // the URL getChapterPages produced
  altSrc?: string;      // same page from a freshly resolved server (arrives late)
  mdCh?: string;        // set for native MangaDex chapters: enables /api/md-page
  mdFirst?: boolean;    // go through /api/md-page before the CDN (default: yes)
  proxy?: boolean;      // second-source images: prefer our /api/manga-img proxy
}

export const viaProxy = (u: string) => (/^https?:\/\//.test(u) ? `/api/manga-img?u=${encodeURIComponent(u)}` : u);
export const mdPageUrl = (ch: string, n: number, extra = "") => `/api/md-page?ch=${encodeURIComponent(ch)}&p=${n}${extra}`;

// MangaDex chapter ids are uuids; second sources carry a "wc:" / "cm:" style tag.
export const isMdChapter = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export function pageChain(o: ChainOpts): string[] {
  const out: string[] = [];
  const add = (u?: string) => { if (u && !out.includes(u)) out.push(u); };
  if (o.mdCh) {
    // The CDN intermittently 404s browser requests (and a browser can't change its
    // User-Agent), so our md-page route, which fetches with a plain agent, retries,
    // and caches successes, is the dependable path and goes first. The direct CDN
    // url is the fallback; then the data-saver copy; then the late fresh-server url.
    const md = mdPageUrl(o.mdCh, o.n);
    if (o.mdFirst !== false) { add(md); add(o.src); } else { add(o.src); add(md); }
    add(mdPageUrl(o.mdCh, o.n, "&saver=1"));
    if (o.altSrc && o.altSrc !== o.src) add(o.altSrc);
  } else {
    const primary = o.proxy ? viaProxy(o.src) : o.src;
    const secondary = o.proxy ? o.src : viaProxy(o.src);
    add(primary); add(secondary);
    if (o.altSrc && o.altSrc !== o.src) add(o.proxy ? viaProxy(o.altSrc) : o.altSrc);
  }
  return out;
}

// After every url in the chain has failed, wait and go round again — a node's
// 404 episode often clears within a minute. Then give up and offer a tap-to-retry.
export const RETRY_DELAYS = [1500, 4000, 9000, 18000, 30000];
