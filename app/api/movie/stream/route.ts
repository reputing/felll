import { memberOr401 } from "@/lib/auth";
import { stream8Movie } from "@/lib/stream8";

// Resolve a movie's direct HLS from 8Stream at play time, so the movie page
// never blocks on it during render. Members only.
export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const imdb = new URL(req.url).searchParams.get("imdb") ?? "";
  const sources = await stream8Movie(imdb);
  return Response.json({ sources }, { headers: { "cache-control": "private, no-store" } });
}
