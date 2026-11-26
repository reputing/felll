import { memberOr401 } from "@/lib/auth";
import { castWithPhotos } from "@/lib/people";

// Photos for a title's cast: GET ?names=Brad Pitt|Morgan Freeman|... (members only). Looked up lazily by the page so the
// watch page itself never waits on them; every answer is cached.
export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const names = (new URL(req.url).searchParams.get("names") ?? "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 16);
  return Response.json({ people: await castWithPhotos(names) }, { headers: { "cache-control": "private, max-age=3600" } });
}
