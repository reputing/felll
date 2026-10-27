import { currentUser } from "@/lib/auth";

// Resolve-fresh MangaDex page proxy.
//
// The at-home base URL that getChapterPages hands the browser carries a
// short-lived token and expires after ~15 min. On a long chapter (a 34-page
// 18+ title) the later pages 404 by the time you reach them — both direct from
// the CDN AND through the generic /api/manga-img proxy of that now-stale URL.
// That was the "18+ pages don't load" bug: the proxied *.mangadex.network URL
// came back 404 because the token had already expired.
//
// This route sidesteps expiry entirely: instead of a baked URL it takes the
// chapter id + page index and resolves a FRESH at-home server at request time,
// then streams the bytes back. The resolution is cached per chapter for a
// couple of minutes so one chapter view costs ~one at-home call, not one per
// page (at-home rate-limits a busy datacenter IP). Members only, same as the
// other proxies.

const MD = "https://api.mangadex.org";

interface AtHome {
  base: string;
  hash: string;
  data: string[];
  dataSaver: string[];
  at: number;
}

// Per-isolate cache of the resolved at-home server for a chapter. Best-effort:
// on a miss (or after the TTL) we just resolve again.
const cache = new Map<string, Promise<AtHome>>();
const TTL = 2 * 60 * 1000;

async function resolve(ch: string, fresh = false): Promise<AtHome> {
  if (!fresh) {
    const hit = cache.get(ch);
    if (hit) {
      const v = await hit.catch(() => null);
      if (v && Date.now() - v.at < TTL) return v;
    }
  }
  const p = fetch(`${MD}/at-home/server/${ch}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) }).then(async (r) => {
    if (!r.ok) throw new Error(`at-home ${r.status}`);
    const d = (await r.json()) as { baseUrl: string; chapter?: { hash: string; data?: string[]; dataSaver?: string[] } };
    return { base: d.baseUrl, hash: d.chapter?.hash ?? "", data: d.chapter?.data ?? [], dataSaver: d.chapter?.dataSaver ?? [], at: Date.now() };
  });
  cache.set(ch, p);
  p.catch(() => cache.delete(ch));
  return p;
}

export async function GET(req: Request) {
  if (!(await currentUser())) return new Response("sign in first", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const ch = sp.get("ch");
  const p = Number(sp.get("p"));
  const saver = sp.get("saver") === "1";
  if (!ch || !Number.isInteger(p) || p < 0) return new Response("bad request", { status: 400 });

  const headers: Record<string, string> = {
    // Some CDN nodes 403 the default Workers fetch agent; look like a browser.
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
  };

  // Two attempts: the first may use the cached resolution; if the node has
  // rotated/expired (404/410) or is rate-limited (429/5xx), drop it and resolve
  // a genuinely fresh server for the second try.
  for (let attempt = 0; attempt < 2; attempt++) {
    let home: AtHome;
    try {
      home = await resolve(ch, attempt > 0);
    } catch {
      return new Response("chapter unreachable", { status: 502, headers: { "cache-control": "no-store" } });
    }
    const files = saver ? home.dataSaver : home.data;
    const file = files[p];
    if (!file) return new Response("no such page", { status: 404, headers: { "cache-control": "no-store" } });

    const target = `${home.base}/${saver ? "data-saver" : "data"}/${home.hash}/${file}`;
    let upstream: Response | null = null;
    try {
      upstream = await fetch(target, { headers, signal: AbortSignal.timeout(20_000) });
    } catch {
      upstream = null;
    }
    if (upstream && upstream.ok) {
      return new Response(upstream.body, {
        status: 200,
        headers: { "content-type": upstream.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=86400, immutable" },
      });
    }
    // Stale node or transient error → invalidate and re-resolve once more.
    cache.delete(ch);
    // A genuine non-retryable error that isn't an expiry (e.g. 403) → give up.
    if (upstream && upstream.status !== 404 && upstream.status !== 410 && upstream.status !== 429 && upstream.status < 500) {
      return new Response(null, { status: upstream.status, headers: { "cache-control": "no-store" } });
    }
  }
  return new Response("image unreachable", { status: 502, headers: { "cache-control": "no-store" } });
}
