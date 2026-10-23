import { currentUser } from "@/lib/auth";

// Same-origin proxy for the MangaDex JSON API. The browser can't always read
// api.mangadex.org directly (CORS), so the reader calls /api/md/* and we forward
// it server-side. Page images still load straight from the MangaDex CDN (an
// <img> needs no CORS). Members only.
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!(await currentUser())) return new Response("sign in first", { status: 401 });
  const p = (await params).path.join("/");
  const url = `https://api.mangadex.org/${p}${new URL(req.url).search}`;
  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { accept: "application/json", "user-agent": "cupcake.gg/1.0 (+https://cupcake.gg)" } });
  } catch {
    return Response.json({ error: "mangadex unreachable" }, { status: 502 });
  }
  const body = await upstream.text();
  // at-home URLs carry short-lived tokens; never cache those. Lists/details are fine briefly.
  const cache = p.startsWith("at-home") ? "no-store" : "public, max-age=120";
  return new Response(body, { status: upstream.status, headers: { "content-type": "application/json", "cache-control": cache } });
}
