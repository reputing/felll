import { memberOr401 } from "@/lib/auth";
import { nativeSources } from "@/lib/movie-native";

// Ad-free native sources for a title, resolved at play time so the page never
// waits on the providers. Members only.
export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const u = new URL(req.url).searchParams;
  const type = u.get("type") === "tv" ? "tv" : "movie";
  const sources = await nativeSources(type, Number(u.get("id")), Number(u.get("s")) || undefined, Number(u.get("e")) || undefined);
  return Response.json({ sources }, { headers: { "cache-control": "private, no-store" } });
}
