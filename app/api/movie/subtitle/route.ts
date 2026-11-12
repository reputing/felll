import { memberOr401 } from "@/lib/auth";

// One subtitle file, fetched for the player (members only). Only the subtitle addon's own file hosts are allowed, so this
// cannot be used to fetch anything else.
export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const raw = new URL(req.url).searchParams.get("u") ?? "";
  let url: URL;
  try { url = new URL(raw); } catch { return new Response("bad url", { status: 400 }); }
  if (url.protocol !== "https:" || !/^subs\d*\.strem\.io$/.test(url.hostname)) return new Response("not allowed", { status: 400 });
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return new Response("not found", { status: 404 });
    const text = await r.text();
    if (text.length > 2_000_000) return new Response("too big", { status: 413 });
    return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, max-age=86400" } });
  } catch { return new Response("unavailable", { status: 502 }); }
}
