import { currentUser } from "@/lib/auth";

// Generic image proxy for the extra manga sources. Manga/manhwa CDNs often
// require a Referer an <img> tag can't send, so the reader points at
// /api/manga-img?u=<image>&r=<referer> and we fetch it with that Referer and
// stream the bytes back. Members only.
export async function GET(req: Request) {
  if (!(await currentUser())) return new Response("sign in first", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const u = sp.get("u");
  if (!u) return new Response("missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return new Response("bad url", { status: 400 });

  const headers: Record<string, string> = {
    // A browser-ish UA; some manga CDNs 403 the default Workers fetch agent.
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
  };
  const r = sp.get("r");
  if (r) {
    try {
      headers.Referer = new URL(r).origin + "/";
    } catch {
      /* ignore bad referer */
    }
  }

  // These CDNs rate-limit a busy datacenter IP, so a page or two in a chapter can
  // come back 429/5xx while the rest load. Retry those a couple of times before
  // giving up — and, crucially, only cache a SUCCESS. Caching a transient error
  // (the old code cached every status for a day) left random pages dead for 24h.
  let upstream: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      upstream = await fetch(target.toString(), { headers, signal: AbortSignal.timeout(20_000) });
    } catch {
      upstream = null;
    }
    if (upstream && upstream.ok) break;
    // 404/403 won't change on retry; only retry rate-limits, 5xx and network drops.
    if (upstream && upstream.status !== 429 && upstream.status < 500) break;
    if (attempt < 2) await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
  }
  if (!upstream) return new Response("image unreachable", { status: 502, headers: { "cache-control": "no-store" } });

  const ct = upstream.headers.get("content-type") || "image/jpeg";
  const cache = upstream.ok ? "public, max-age=86400, immutable" : "no-store";
  return new Response(upstream.ok ? upstream.body : null, {
    status: upstream.status,
    headers: { "content-type": ct, "cache-control": cache },
  });
}
