import { getCloudflareContext } from "@opennextjs/cloudflare";
import { currentUser } from "@/lib/auth";
import { fetchMdPage, reportFailure } from "@/lib/md-page";

// Reliable MangaDex page proxy (see lib/md-page.ts for why the CDN needs this).
// Takes chapter id + page index — not a baked CDN URL — retries with backoff,
// falls back to the data-saver copy, and caches the first success on the
// Cloudflare edge so every later view of that page is instant and can't be hit by
// the node's 404 episodes. Members only (checked before the cache is touched).
export async function GET(req: Request) {
  if (!(await currentUser())) return new Response("sign in first", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const ch = sp.get("ch");
  const p = Number(sp.get("p"));
  const saver = sp.get("saver") === "1";
  if (!ch || !/^[0-9a-f-]{36}$/i.test(ch) || !Number.isInteger(p) || p < 0) return new Response("bad request", { status: 400 });

  // Edge cache (Workers Cache API). Absent in plain `next dev`, so guard it.
  const edge: Cache | null = (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
  const key = new Request(`https://cupcake.gg/__md-page/${ch.toLowerCase()}/${p}/${saver ? "s" : "d"}`);
  if (edge) {
    try {
      const hit = await edge.match(key);
      if (hit) return hit;
    } catch { /* cache unavailable: fall through to a live fetch */ }
  }

  const { res, status, attempts } = await fetchMdPage(ch, p, saver);

  // Tell MangaDex which attempts failed so bad nodes get pulled from rotation.
  const failed = attempts.filter((a) => a.status !== 200);
  let ctx: { waitUntil(p: Promise<unknown>): void } | null = null;
  try { ctx = (await getCloudflareContext({ async: true })).ctx as unknown as { waitUntil(p: Promise<unknown>): void }; } catch { /* not on Workers */ }
  if (ctx) for (const a of failed.slice(0, 3)) ctx.waitUntil(reportFailure(a.url));

  if (res) {
    const out = new Response(res.body, {
      status: 200,
      headers: { "content-type": res.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=86400, immutable" },
    });
    if (edge && ctx) {
      // Keep a copy for next time; the browser still gets the original.
      const copy = out.clone();
      ctx.waitUntil(edge.put(key, copy).catch(() => {}));
    }
    return out;
  }
  // Never cache a failure — the next request should get a fresh chance.
  return new Response(null, { status: status === 404 ? 404 : 502, headers: { "cache-control": "no-store" } });
}
