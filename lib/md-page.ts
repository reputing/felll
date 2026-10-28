// Server-side MangaDex page fetcher. Kept free of auth/next imports so it can be
// tested on its own; app/api/md-page/route.ts wraps it with the member check and
// an edge cache.
//
// What goes wrong: MangaDex pages come from "at-home" CDN nodes, and a node can
// answer 404 for a file that exists — in episodes that come and go over minutes
// (it can't pull the file from origin). The same page flips between 200 and 404 on
// back-to-back requests, and MangaDex usually hands the SAME node out every time,
// so hopping to a "fresh" node rarely helps. What does help: retry the same node
// with a short backoff (most episodes are partial), try the smaller data-saver
// copy (cached separately), re-resolve the node occasionally in case it did
// rotate, and — in the route — cache any success so each page only ever has to
// win once.

const MD = "https://api.mangadex.org";

export interface AtHome {
  base: string;
  hash: string;
  data: string[];
  dataSaver: string[];
  at: number;
}

// Per-isolate cache of the resolved node for a chapter. at-home is rate limited
// (~40/min), so we reuse a resolution rather than asking for one per page.
const cache = new Map<string, Promise<AtHome>>();
const TTL = 5 * 60 * 1000;

export async function resolveAtHome(ch: string, fresh = false, doFetch: typeof fetch = fetch): Promise<AtHome> {
  if (!fresh) {
    const hit = cache.get(ch);
    if (hit) {
      const v = await hit.catch(() => null);
      if (v && Date.now() - v.at < TTL) return v;
    }
  }
  const p = doFetch(`${MD}/at-home/server/${ch}`, {
    headers: { accept: "application/json", "user-agent": "cupcake.gg/1.0 (+https://cupcake.gg)" },
    signal: AbortSignal.timeout(12_000),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`at-home ${r.status}`);
    const d = (await r.json()) as { baseUrl?: string; chapter?: { hash: string; data?: string[]; dataSaver?: string[] } };
    if (!d.baseUrl || !d.chapter?.hash) throw new Error("at-home: malformed response");
    return { base: d.baseUrl, hash: d.chapter.hash, data: d.chapter.data ?? [], dataSaver: d.chapter.dataSaver ?? [], at: Date.now() };
  });
  cache.set(ch, p);
  p.catch(() => { if (cache.get(ch) === p) cache.delete(ch); });
  return p;
}

export function clearAtHomeCache() { cache.clear(); }

export interface Attempt { node: string; kind: "data" | "data-saver"; status: number; url: string }
export interface FetchResult {
  res: Response | null;      // the successful upstream response, when there is one
  status: number;            // last HTTP status seen (0 = network error / unresolved)
  attempts: Attempt[];
}

// An honest, non-browser User-Agent on purpose. Measured against one chapter
// (576 interleaved, randomized requests): non-browser UAs got 288/288 pages, while a
// Chrome UA lost 14/288 — the CDN intermittently 404s browser-looking requests.
// Browsers can't change their UA, which is why direct <img> loads fail for readers;
// this server-side path can, which is the whole point of /api/md-page.
const UA = "cupcake.gg/1.0 (+https://cupcake.gg)";
const MAX_ATTEMPTS = 6;
const BACKOFF = [250, 600, 1200, 2000, 3000];       // ms to wait after attempt 1..5
const BUDGET_MS = 24_000;                            // stop retrying past this, whatever the count

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fetch page `p` of chapter `ch`. Retries with backoff; the 4th and 6th attempts
 *  use the data-saver copy; the 3rd and 5th re-resolve the node (cheap insurance
 *  against a rotated node without hammering the rate-limited at-home API).
 *  `saver` starts on the data-saver copy. */
export async function fetchMdPage(
  ch: string, p: number, saver = false,
  doFetch: typeof fetch = fetch, sleep: Sleep = realSleep,
): Promise<FetchResult> {
  const attempts: Attempt[] = [];
  const t0 = Date.now();
  let status = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0 && Date.now() - t0 > BUDGET_MS) break;
    let home: AtHome;
    try {
      home = await resolveAtHome(ch, attempt === 2 || attempt === 4, doFetch);
    } catch {
      status = 0;
      if (attempt < MAX_ATTEMPTS - 1) await sleep(BACKOFF[Math.min(attempt, BACKOFF.length - 1)]);
      continue;
    }
    // data-saver when asked for, and as the alternate copy on the 4th and 6th tries
    const useSaver = (saver || attempt % 2 === 1 && attempt >= 2) && home.dataSaver.length > 0;
    const kind: Attempt["kind"] = useSaver ? "data-saver" : "data";
    const file = (kind === "data-saver" ? home.dataSaver : home.data)[p];
    if (!file) return { res: null, status: 404, attempts }; // a page index that doesn't exist: nothing to retry

    const url = `${home.base}/${kind}/${home.hash}/${file}`;
    try {
      const r = await doFetch(url, { headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(12_000) });
      status = r.status;
      attempts.push({ node: home.base, kind, status, url });
      if (r.ok) return { res: r, status: r.status, attempts };
      try { await r.body?.cancel(); } catch { /* release the connection before retrying */ }
    } catch {
      status = 0;
      attempts.push({ node: home.base, kind, status: 0, url });
    }
    if (attempt < MAX_ATTEMPTS - 1) await sleep(BACKOFF[Math.min(attempt, BACKOFF.length - 1)]);
  }
  return { res: null, status, attempts };
}

// MangaDex asks clients to report node failures so they can drop bad nodes.
// Fire-and-forget; never allowed to affect the page.
export function reportFailure(url: string, doFetch: typeof fetch = fetch): Promise<unknown> {
  return doFetch("https://api.mangadex.network/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, success: false, bytes: 0, duration: 0, cached: false }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
}
