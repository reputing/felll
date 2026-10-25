import { getCloudflareContext } from "@opennextjs/cloudflare";
import { currentUser } from "@/lib/auth";

// Same-origin proxy for the comick-source-api container (GooglyBlox) — we use its
// weebcentral source, which reliably carries licensed manhwa (Solo Leveling etc.)
// WITH pages. Members only. Supports POST (search/chapters) and GET (proxy/html).
// Unset WEEB_API_URL = 503 → the resolver falls through.
async function base(): Promise<string | null> {
  let url: string | undefined;
  try {
    const env = (await getCloudflareContext({ async: true })).env as unknown as { WEEB_API_URL?: string };
    url = env?.WEEB_API_URL;
  } catch {
    /* not in a request context */
  }
  if (!url) url = process.env.WEEB_API_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

async function forward(req: Request, path: string[]): Promise<Response> {
  if (!(await currentUser())) return new Response("sign in first", { status: 401 });
  const b = await base();
  if (!b) return Response.json({ error: "not configured" }, { status: 503 });
  const url = `${b}/${path.join("/")}${new URL(req.url).search}`;
  const reqBody = req.method === "POST" ? await req.text() : undefined;
  const init: RequestInit = {
    method: req.method,
    signal: AbortSignal.timeout(50_000),
    ...(reqBody !== undefined ? { body: reqBody, headers: { "content-type": "application/json", accept: "application/json" } } : {}),
  };
  // The container scales to zero; the first hit returns a "no Container instance
  // available" provisioning message. Wait for it to spin up and retry.
  let upstream: Response;
  let body = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      upstream = await fetch(url, init);
    } catch {
      return Response.json({ error: "unreachable" }, { status: 502 });
    }
    body = await upstream.text();
    if (!/no Container instance available|currently provisioning/i.test(body)) {
      const ct = upstream.headers.get("content-type") || "application/json";
      return new Response(body, { status: upstream.status, headers: { "content-type": ct, "cache-control": upstream.ok ? "public, max-age=120" : "no-store" } });
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return Response.json({ error: "provisioning" }, { status: 503 });
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await params).path);
}
export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await params).path);
}
