import { memberOr401 } from "@/lib/auth";

// An AniList-tracked manga has no MangaDex id, so look it up by title and send the member to it
// (with ?ch= so the page can offer "Continue · Ch. N+1"). Falls back to a search if nothing matches.
export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const sp = new URL(req.url).searchParams;
  const title = (sp.get("title") || "").trim().slice(0, 100);
  const ch = Math.max(0, Number(sp.get("ch")) || 0);
  const search = new URL(`/manga?q=${encodeURIComponent(title)}`, req.url);
  if (!title) return Response.redirect(search, 303);
  try {
    const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1&order[relevance]=desc&hasAvailableChapters=true&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
    const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "cupcake.gg/1.0 (+https://cupcake.gg)" }, signal: AbortSignal.timeout(8000) });
    const id = ((await res.json()) as { data?: { id: string }[] }).data?.[0]?.id;
    if (id) return Response.redirect(new URL(`/manga/${id}${ch ? `?ch=${ch}` : ""}`, req.url), 303);
  } catch { /* fall through to the search */ }
  return Response.redirect(search, 303);
}
