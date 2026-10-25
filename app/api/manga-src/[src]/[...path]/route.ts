import { getCloudflareContext } from "@opennextjs/cloudflare";
import { currentUser } from "@/lib/auth";

// Same-origin proxy for the extra manga source containers (VortexScans, Omega).
// Members only. Each source maps to its own *_API_URL var; unset = 503 so the
// /read/<source> page shows an "isn't enabled" state. Adult sources additionally
// require the 18+ cookie the age gate sets.
const ENV_VAR: Record<string, string> = {
  vortexscans: "VORTEXSCANS_API_URL",
  omega: "OMEGA_API_URL",
};
const ADULT = new Set(["omega"]);
export const ADULT_COOKIE = "cupcake_adult";

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
  if (!(await currentUser())) return new Response("sign in first", { status: 401 });
  const { src, path } = await params;
  if (!ENV_VAR[src]) return new Response("unknown source", { status: 404 });

  // 18+ gate for adult sources.
  if (ADULT.has(src)) {
    const cookie = req.headers.get("cookie") ?? "";
    if (!new RegExp(`(?:^|; )${ADULT_COOKIE}=1(?:;|$)`).test(cookie)) {
      return Response.json({ error: "age confirmation required" }, { status: 403 });
    }
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
