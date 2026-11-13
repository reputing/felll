import { memberOr401 } from "@/lib/auth";
import { EMBED_POLICY, flixServers } from "@/lib/flixcloud";

// GET /api/anime-flix?anilistId=206401&episode=7
//   -> { servers: [{ name, language, hardsub, embedUrl }], policy, playbackAvailability, adFreeGuaranteed: false, notice }
// Optional extra servers (see lib/flixcloud.ts for what is and is not verified). Members only. A listed link is NOT a promise that
// the video plays, and the player is not ad-free: the response says so, and the page shows the same words.
export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const u = new URL(req.url).searchParams;
  const servers = await flixServers(u.get("anilistId"), u.get("episode"));
  return Response.json(
    {
      servers,
      policy: EMBED_POLICY,
      playbackAvailability: "unverified",
      adFreeGuaranteed: false,
      notice: "Beta server. It may show ads, progress is not saved, and playback is not guaranteed.",
    },
    { headers: { "cache-control": "private, max-age=300" } },
  );
}
