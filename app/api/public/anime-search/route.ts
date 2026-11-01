import { searchAnime } from "@/lib/jikan";

// Public, unauthenticated, CORS-open - same shape as app/api/public/kuro-profile
// (added for kuro.rip's cupcake widget earlier). This one's for kuro's voice
// call "browse cupcake" panel: pick something to watch together without
// needing a cupcake account, just metadata (title/poster/episode count), so
// it's safe to leave wide open. Actually resolving a playable stream is a
// separate, NOT public, endpoint - see app/api/internal/resolve-episode.
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET" };

// crude per-IP throttle: this app has no shared rate-limit helper, and a
// Workers instance is short-lived anyway, so an in-memory map is "good
// enough" rather than bulletproof - the point is making scraping annoying,
// not airtight.
const hits = new Map<string, { n: number; at: number }>();
function throttled(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 60_000) { hits.set(ip, { n: 1, at: now }); return false; }
  h.n++;
  return h.n > 20;
}

export async function GET(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown";
  if (throttled(ip)) return Response.json({ error: "slow down" }, { status: 429, headers: CORS });
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 100) || "";
  if (!q) return Response.json({ results: [] }, { headers: CORS });
  const page = await searchAnime({ q, limit: 12 }).catch(() => null);
  if (!page) return Response.json({ results: [] }, { headers: CORS });
  return Response.json(
    { results: page.items.map((a) => ({ id: a.id, title: a.title, poster: a.poster, episodes: a.episodes, format: a.format })) },
    { headers: CORS },
  );
}
