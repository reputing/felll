import { env } from "@/lib/db";
import { malToAnilist, fetchAnivexaCatalog, resolveAnivexaStream } from "@/lib/anivexa";
import { signKirariAccess } from "@/lib/kuro";

// NOT public. A playable stream URL is exactly what app/api/play/[sourceId]
// already treats as sensitive ("Stream URLs are signed per request so they
// can't be hot-linked", member-only there) - a wide-open CORS endpoint
// handing those out to anyone would undercut that on purpose. This is the
// same shape of trust felll already extends the OTHER way (lib/kuro.ts reads
// kuro's Supabase directly with KURO_SERVICE_KEY): kuro's own server, not a
// browser, calls this with a shared secret, after kuro has already checked
// the caller is a real signed-in member in a live voice call. Needs
// KIRARI_SERVICE_KEY set here and on kirari's side (CUPCAKE_SERVICE_KEY).
export async function POST(req: Request) {
  const e = await env();
  const want = (e as unknown as { KIRARI_SERVICE_KEY?: string }).KIRARI_SERVICE_KEY;
  if (!want || req.headers.get("x-kirari-key") !== want) return Response.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { malId?: number; episode?: number };
  const malId = Number(body.malId);
  const episode = Number(body.episode);
  if (!Number.isInteger(malId) || malId <= 0 || !Number.isInteger(episode) || episode <= 0) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const anilistId = await malToAnilist(malId).catch(() => null);
  if (!anilistId) return Response.json({ error: "no stream for this one" }, { status: 404 });
  const catalog = await fetchAnivexaCatalog(anilistId).catch(() => null);
  if (!catalog) return Response.json({ error: "no stream for this one" }, { status: 404 });

  // try providers in the catalog's own order (already ranked) until one
  // actually resolves to an HLS stream for this episode - same fallback
  // shape app/api/play/[sourceId] uses, just trying more than one server
  // instead of leaving that to the player's own retry.
  for (const p of catalog.providers) {
    if (!p.sub.includes(episode)) continue;
    const resolved = await resolveAnivexaStream(p.slug, anilistId, "sub", episode).catch(() => null);
    if (resolved?.type === "hls" && resolved.url) {
      // resolved.url is a RELATIVE /api/anivexa/proxy path (anivexaProxyPath),
      // and that proxy normally only answers a cupcake.gg member session -
      // kirari has no such cookie, so without this token every request 404s/
      // 401s. The caller (kirari) must turn this into an absolute
      // https://cupcake.gg/... URL itself; we only own the path + token.
      const kt = await signKirariAccess(want);
      const url = resolved.url + (resolved.url.includes("?") ? "&" : "?") + "kt=" + encodeURIComponent(kt);
      return Response.json({ url, provider: p.slug });
    }
  }
  return Response.json({ error: "couldn't find a working stream for this episode" }, { status: 404 });
}
