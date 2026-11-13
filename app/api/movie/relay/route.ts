import { memberOr401 } from "@/lib/auth";
import { nativeMediaUrl } from "@/lib/movie-native";

// Streams one HLS playlist or segment from the resolver container through our
// own origin (members only). The token is signed and expires, and the container
// only fetches allowlisted media hosts, so this is not an open proxy. Range is
// forwarded so seeking works; the body is streamed, never buffered here.
export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!t || t.length > 8192) return new Response("bad token", { status: 400 });
  const target = await nativeMediaUrl(t);
  if (!target) return new Response("Not available", { status: 404 });

  const headers: Record<string, string> = { "x-resolver-key": target.key };
  const range = req.headers.get("range");
  if (range) headers.range = range;
  let up: Response;
  try { up = await fetch(target.url, { headers, signal: req.signal }); } catch { return new Response("Upstream unavailable", { status: 502 }); }

  const out = new Headers();
  for (const h of ["content-type", "content-length", "accept-ranges", "content-range"]) {
    const v = up.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("cache-control", "private, no-store");
  out.set("x-content-type-options", "nosniff");
  return new Response(up.body, { status: up.status, headers: out });
}
