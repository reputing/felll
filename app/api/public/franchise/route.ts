import { getFranchise, lastError } from "@/lib/franchise";

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
  const mal = Number(sp.get("mal"));
  if (!Number.isInteger(mal) || mal <= 0) return Response.json({ error: "mal id?" }, { status: 400 });
  const f = await getFranchise(mal).catch((e) => { return { error: String(e) } as never; });
  return Response.json({ franchise: f ?? null, ...(sp.get("debug") ? { why: f ? "" : lastError || "nothing related found" } : {}) }, { headers: { "cache-control": "public, max-age=300" } });
}
