import { currentUser } from "@/lib/auth";

// Same-origin proxy for comick.io's public API (api.comick.fun). Members only.
// comick requires a browser-ish User-Agent, which we add here. No API key, no
// container — comick hosts it.
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!(await currentUser())) return new Response("sign in first", { status: 401 });
  const p = (await params).path.join("/");
  const url = `https://api.comick.fun/${p}${new URL(req.url).search}`;
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (cupcake.gg)" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return Response.json({ error: "comick unreachable" }, { status: 502 });
  }
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { "content-type": "application/json", "cache-control": upstream.ok ? "public, max-age=120" : "no-store" },
  });
}
