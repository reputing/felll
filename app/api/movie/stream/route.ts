import { memberOr401 } from "@/lib/auth";
import { movieStream, movieboxFind } from "@/lib/movies";
import { stream8Movie } from "@/lib/stream8";

// The direct ("Cupcake") sources for a title, resolved when somebody presses play so the watch page never waits on
// them. Two backends in order, then the player falls back to the embed servers by itself when this returns nothing:
//   1. the Moviebox container: matched by name and year, 1080p/720p/... MP4, with a same-origin proxy URL beside each
//      direct one (the CDN is fussy about who asks, so the player tries both);
//   2. 8Stream, when STREAM8_API_URL is set: HLS for a film by its IMDb id.
// Members only.
export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const u = new URL(req.url).searchParams;
  const media = u.get("media") === "tv" ? "tv" : "movie";
  const title = (u.get("title") ?? "").slice(0, 120);
  const year = Number(u.get("year")) || null;
  const se = media === "tv" ? Math.max(1, Number(u.get("se")) || 1) : undefined;
  const ep = media === "tv" ? Math.max(1, Number(u.get("ep")) || 1) : undefined;
  const imdb = u.get("imdb") ?? "";

  type Out = { label: string; url: string; format: "mp4" | "hls"; proxy?: string };
  let sources: Out[] = [];
  const tried: string[] = [];

  try {
    const hit = await movieboxFind(title, year, media);
    tried.push(hit ? "moviebox:matched" : "moviebox:no-match");
    if (hit) {
      const st = await movieStream(hit.id, hit.slug, se, ep);
      sources = (st?.sources ?? []).map((s) => ({ label: s.res, url: s.url, format: s.format === "hls" ? "hls" : "mp4", proxy: s.proxy }));
      if (!sources.length) tried.push("moviebox:no-streams");
    }
  } catch { tried.push("moviebox:error"); }

  if (!sources.length && media === "movie" && imdb) {
    try {
      const s8 = await stream8Movie(imdb);
      sources = s8.map((s) => ({ label: s.label, url: s.url, format: "hls" as const }));
      tried.push(s8.length ? "stream8:ok" : "stream8:none");
    } catch { tried.push("stream8:error"); }
  }

  return Response.json({ sources, tried }, { headers: { "cache-control": "private, no-store" } });
}
