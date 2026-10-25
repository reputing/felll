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

  const headers: Record<string, string> = {};
  const r = sp.get("r");
  if (r) {
    try {
      headers.Referer = new URL(r).origin + "/";
    } catch {
      /* ignore bad referer */
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), { headers, signal: AbortSignal.timeout(20_000) });
  } catch {
    return new Response("image unreachable", { status: 502 });
  }
  const ct = upstream.headers.get("content-type") || "image/jpeg";
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": ct, "cache-control": "public, max-age=86400" },
  });
}
