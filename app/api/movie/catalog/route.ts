import { memberOr401 } from "@/lib/auth";
import { movieCatalog } from "@/lib/tmdb";

// Browse the movie/series catalog (members only). Keeps MOVIEBOX_API_URL server-side.
export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const u = new URL(req.url).searchParams;
  const page = await movieCatalog({
    type: u.get("type") ?? undefined,
    sort: u.get("sort") ?? undefined,
    page: Number(u.get("page")) || 1,
    q: u.get("q") ?? undefined,
  });
  return Response.json(page, { headers: { "cache-control": "no-store" } });
}
