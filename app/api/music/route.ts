import { memberOr401 } from "@/lib/auth";
import { eviCall } from "@/lib/music-server";

// The members' music player. search / lyrics return the catalog's own JSON ({ data } or { error });
// stream answers a redirect to a fresh signed audio link, which the <audio> element follows (it supports
// byte ranges, so seeking works). Members only: this is not an open proxy to the catalog.
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const sp = new URL(req.url).searchParams;
  const op = sp.get("op") || "";
  const qs = new URLSearchParams();

  if (op === "search") {
    const q = (sp.get("q") || "").trim().slice(0, 120);
    if (!q) return Response.json({ error: { code: "missing_query", message: "type something to search for" } }, { status: 400 });
    qs.set("op", "search"); qs.set("q", q); qs.set("limit", String(Math.max(1, Math.min(15, Number(sp.get("limit")) || 10))));
  } else if (op === "lyrics" || op === "stream") {
    const id = (sp.get("id") || "").trim();
    if (!ID.test(id)) return Response.json({ error: { code: "track_not_found", message: "that isn't a track id" } }, { status: 400 });
    qs.set("op", op); qs.set("id", id);
  } else return Response.json({ error: { code: "missing_query", message: "unknown op" } }, { status: 400 });

  const r = await eviCall(req, qs, op === "stream");
  if (!r) return Response.json({ error: { code: "audio_unavailable", message: "the music service didn't answer in time" } }, { status: 504 });

  if (op === "stream") {
    // pass on only a redirect to evi's own host (a signed link), never anything else
    const loc = r.headers.get("location") || "";
    let ok = false;
    try { const u = new URL(loc); ok = r.status >= 300 && r.status < 400 && u.protocol === "https:" && u.hostname === "evi.wtf" && u.searchParams.has("sig") && !u.username; } catch { /* not a url */ }
    if (!ok) return Response.json({ error: { code: "audio_unavailable", message: "no playable stream" } }, { status: 502 });
    return new Response(null, { status: 307, headers: { location: loc, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }

  const body = await r.text();
  return new Response(body, { status: r.ok ? 200 : r.status >= 400 ? r.status : 502, headers: { "content-type": "application/json", "cache-control": op === "lyrics" ? "private, max-age=600" : "no-store" } });
}
