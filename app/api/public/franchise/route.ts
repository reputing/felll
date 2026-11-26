import { memberOr401 } from "@/lib/auth";
import { getFranchise, lastError } from "@/lib/franchise";
import { eviCall } from "@/lib/music-server";

// A show's franchise map (seasons, movies, alternates, side stories) by MAL id. Public metadata only,
// and cached per show for two weeks, so it is safe to leave open; the throttle just keeps it from
// being used to hammer AniList through us. ?debug=1 also says why a lookup came back empty.
const hits = new Map<string, { n: number; at: number }>();
function throttled(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 60_000) { hits.set(ip, { n: 1, at: now }); return false; }
  return ++h.n > 12;
}

export async function GET(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown";
  if (throttled(ip)) return Response.json({ error: "slow down" }, { status: 429 });
  const sp = new URL(req.url).searchParams;
  // the probe makes outbound calls (AniList, and the keyless AI vision services) from our server: members only, so nobody can use the open
  // endpoint to spend those services' per-IP allowance and leave /shh without its fallbacks
  if (sp.get("probe")) {
    const me = await memberOr401();
    if (me instanceof Response) return me;
    return Response.json({ ...(await probe()), ...(await musicProbe(req)) }, { headers: { "cache-control": "no-store" } });
  }
  const mal = Number(sp.get("mal"));
  if (!Number.isInteger(mal) || mal <= 0) return Response.json({ error: "mal id?" }, { status: 400 });
  const f = await getFranchise(mal).catch((e) => { return { error: String(e) } as never; });
  return Response.json({ franchise: f ?? null, ...(sp.get("debug") ? { why: f ? "" : lastError || "nothing related found" } : {}) }, { headers: { "cache-control": f && f.partial ? "no-store" : "public, max-age=300" } });
}

// Which franchise data sources this server can actually reach (AniList 403s some hosting networks).
async function probe() {
  const out: Record<string, string> = {};
  const q = JSON.stringify({ query: "query{Media(idMal:5081,type:ANIME){id}}" });
  const tries: [string, () => Promise<Response>][] = [
    ["anilist: no extra headers", () => fetch("https://graphql.anilist.co", { method: "POST", headers: { "content-type": "application/json" }, body: q })],
    ["anilist: custom UA", () => fetch("https://graphql.anilist.co", { method: "POST", headers: { "content-type": "application/json", "user-agent": "cupcake.gg/1.0 (+https://cupcake.gg)" }, body: q })],
    ["anilist: browser UA", () => fetch("https://graphql.anilist.co", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", origin: "https://anilist.co", referer: "https://anilist.co/" }, body: q })],
    ["kitsu mappings", () => fetch("https://kitsu.io/api/edge/mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=5081&include=item", { headers: { accept: "application/vnd.api+json" } })],
    ["jikan relations", () => fetch("https://api.jikan.moe/v4/anime/5081/relations")],
    ["ovh vision (keyless)", () => fetch("https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "Qwen2.5-VL-72B-Instruct", max_tokens: 12, messages: [{ role: "user", content: [{ type: "text", text: "What colour is this image? One word." }, { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==" } }] }] }) })],
    ["kilo vision (keyless)", () => fetch("https://api.kilo.ai/api/gateway/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "nvidia/nemotron-3.5-super-vl:free", max_tokens: 300, messages: [{ role: "user", content: [{ type: "text", text: "What colour is this image? One word." }, { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==" } }] }] }) })],
    ["ocr.space (demo key)", () => fetch("https://api.ocr.space/parse/image", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ apikey: "helloworld", base64Image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", language: "eng" }) })],
    ["arm ids", () => fetch("https://arm.haglund.dev/api/v2/ids?source=myanimelist&id=5081")],
  ];
  for (const [name, f] of tries) {
    try { const r = await f(); out[name] = `${r.status} ${(await r.text()).slice(0, 80).replace(/\s+/g, " ")}`; } catch (e) { out[name] = `error ${(e as Error).message}`; }
  }
  return out;
}

// The music player asks kuro's catalog route (see lib/music-server): can this server reach it?
async function musicProbe(req: Request) {
  const out: Record<string, string> = {};
  try {
    const r = await eviCall(req, new URLSearchParams({ op: "search", q: "lofi", limit: "1" }));
    out["music via kuro (search)"] = r ? `${r.status} ${(await r.text()).slice(0, 90).replace(/\s+/g, " ")}` : "no answer";
    const s = await eviCall(req, new URLSearchParams({ op: "stream", id: "LE8LILQggvO" }), true);
    out["music via kuro (stream link)"] = s ? `${s.status} ${(s.headers.get("location") || "").slice(0, 60)}` : "no answer";
  } catch (e) { out["music via kuro"] = `error ${(e as Error).message}`; }
  return out;
}
