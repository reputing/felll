import { currentUser } from "@/lib/auth";

// Image proxy for Consumet page images. Many manga CDNs require a Referer (or
// other header) that an <img> tag can't send, so the reader points at
// /api/consumet/img?u=<image>&h=<json headers> and we fetch it with those
// headers and stream the bytes back. Members only.
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
  // Only ever fetch http(s) image hosts (the member is trusted, but keep it tight).
  if (target.protocol !== "https:" && target.protocol !== "http:") return new Response("bad url", { status: 400 });

  let headers: Record<string, string> = {};
  const h = sp.get("h");
  if (h) {
    try {
      const parsed = JSON.parse(h);
      if (parsed && typeof parsed === "object") headers = parsed as Record<string, string>;
    } catch {
      /* ignore bad header blob */
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
