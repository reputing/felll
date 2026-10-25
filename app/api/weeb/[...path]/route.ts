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
  const mkInit = (): RequestInit => ({
    method: req.method,
    signal: AbortSignal.timeout(20_000),
    ...(reqBody !== undefined ? { body: reqBody, headers: { "content-type": "application/json", accept: "application/json" } } : {}),
  });
  // The container scales to zero; a cold Next.js start takes ~40s and the first
  // hits return a "no Container instance available" provisioning message. Keep
  // retrying (a fresh signal each time) until it's up — up to ~75s.
  let body = "";
  let status = 502;
  let ct = "application/json";
  for (let attempt = 0; attempt < 16; attempt++) {
    let upstream: Response;
    try {
      upstream = await fetch(url, mkInit());
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    body = await upstream.text();
    status = upstream.status;
    ct = upstream.headers.get("content-type") || "application/json";
    const provisioning = /no Container instance available|currently provisioning/i.test(body);
    if (!provisioning && upstream.ok) {
      return new Response(body, { status, headers: { "content-type": ct, "cache-control": "public, max-age=300" } });
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return new Response(body || JSON.stringify({ error: "provisioning" }), { status: status === 502 ? 503 : status, headers: { "content-type": ct, "cache-control": "no-store" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await params).path);
}
export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await params).path);
}
