import { getCloudflareContext } from "@opennextjs/cloudflare";
import { currentUser } from "@/lib/auth";

// Same-origin proxy for the self-hosted Consumet manga API (a Cloudflare
// Container, like the Anivexa anime bot). The reader calls /api/consumet/* and
// we forward server-side. Members only. When CONSUMET_API_URL is unset this
// answers 503 and the reader falls back to MangaDex — so manga is unaffected
// until a container is deployed.
async function base(): Promise<string | null> {
  let url: string | undefined;
  try {
    const env = (await getCloudflareContext({ async: true })).env as unknown as { CONSUMET_API_URL?: string };
    url = env?.CONSUMET_API_URL;
  } catch {
    /* not in a request context */
  }
  if (!url) url = process.env.CONSUMET_API_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!(await currentUser())) return new Response("sign in first", { status: 401 });
  const b = await base();
  if (!b) return Response.json({ error: "no second manga provider configured" }, { status: 503 });
  const p = (await params).path.join("/");
  const url = `${b}/${p}${new URL(req.url).search}`;
  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  } catch {
    return Response.json({ error: "provider unreachable" }, { status: 502 });
  }
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=120" },
  });
}
