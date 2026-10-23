import { memberOr401 } from "@/lib/auth";
import { movieProxyTarget } from "@/lib/movies";

// Streams the movie backend's /proxy through our own origin (members only), so
// the browser only ever sees cupcake.gg — the backend's workers.dev host stays
// server-side. Forwards Range so seeking still works.
export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;

  const u = new URL(req.url).searchParams;
  const sid = u.get("sid") ?? "";
  const slug = u.get("slug") ?? "";
  const res = u.get("res") || "best";
  const se = u.get("se") ? Number(u.get("se")) : undefined;
  const ep = u.get("ep") ? Number(u.get("ep")) : undefined;

  const target = await movieProxyTarget(sid, slug, res, se, ep);
  if (!target) return new Response("Not available", { status: 404 });

  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetch(target, { headers: range ? { range } : {} });
  } catch {
    return new Response("Upstream unavailable", { status: 502 });
  }

  const headers = new Headers();
  for (const h of ["content-type", "content-length", "accept-ranges", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}
