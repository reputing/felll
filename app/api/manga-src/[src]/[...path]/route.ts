import { getCloudflareContext } from "@opennextjs/cloudflare";
import { currentUser } from "@/lib/auth";

// Same-origin proxy for the extra own-catalogue manga source containers.
// Members only. Each source maps to its own *_API_URL var; unset = 503 so the
// /read/<source> page shows an "isn't enabled" state. Adult sources additionally
// require the viewer to have admin-granted 18+ access (users.adult_ok), enforced
// here server-side — not a cookie the viewer can set themselves.
const ENV_VAR: Record<string, string> = {
  vortexscans: "VORTEXSCANS_API_URL",
  doujin: "DOUJIN_API_URL",
};
// Adult own-catalogue sources — gated on users.adult_ok, enforced below.
const ADULT = new Set(["doujin"]);

async function baseFor(src: string): Promise<string | null> {
  const key = ENV_VAR[src];
  if (!key) return null;
  let url: string | undefined;
  try {
    const env = (await getCloudflareContext({ async: true })).env as unknown as Record<string, string | undefined>;
    url = env?.[key];
  } catch {
    /* not in a request context */
  }
  if (!url) url = process.env[key];
  return url ? url.replace(/\/+$/, "") : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ src: string; path: string[] }> }) {
  const user = await currentUser();
  if (!user) return new Response("sign in first", { status: 401 });
  const { src, path } = await params;
  if (!ENV_VAR[src]) return new Response("unknown source", { status: 404 });

  // Adult sources require admin-granted 18+ access.
  if (ADULT.has(src) && user.adult_ok !== 1) {
    return Response.json({ error: "18+ access required" }, { status: 403 });
  }

  const b = await baseFor(src);
  if (!b) return Response.json({ error: "source not configured" }, { status: 503 });
  const url = `${b}/${path.join("/")}${new URL(req.url).search}`;
  let upstream: Response;
  try {
    // The container scales to zero; a cold start can take ~30s, so give it room
    // rather than aborting and making "Load more" look like the end of the list.
    upstream = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(50_000) });
  } catch {
    return Response.json({ error: "source unreachable" }, { status: 502 });
  }
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    // Never cache a failure (a cold-start 5xx mustn't stick for 2 minutes).
    headers: { "content-type": "application/json", "cache-control": upstream.ok ? "public, max-age=120" : "no-store" },
  });
}
