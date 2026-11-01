import { all, first } from "@/lib/db";
import { memberStats } from "@/lib/stats";
import type { User } from "@/lib/auth";

// Public, unauthenticated read of a member's box, for kuro.rip's bio-page
// widget (kirari components/CupcakeProfile.tsx + the "cupcake" bio widget).
// No session, no cookies - just a handle, same as a MAL/AniList public
// profile. CORS is wide open on purpose: this is non-sensitive, already-public
// profile data and it's read from whatever vanity domain a kuro page happens
// to be on (kuro.rip and its sister domains), not just one fixed origin.
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET" };

interface LibRow { mal_id: number; title: string; image: string | null; progress: number; episodes: number | null }

export async function GET(req: Request) {
  const handle = new URL(req.url).searchParams.get("handle")?.trim().toLowerCase().slice(0, 64) || "";
  if (!handle) return Response.json({ error: "handle required" }, { status: 400, headers: CORS });

  const u = await first<User>(
    "select id, handle, display_name, avatar_url, banner_url, bio, pronouns, accent, status_text, private_lists from users where handle = ?",
    handle,
  );
  if (!u) return Response.json({ error: "not found" }, { status: 404, headers: CORS });

  const listsPrivate = !!u.private_lists;
  const [stats, watching] = await Promise.all([
    memberStats(u.id),
    listsPrivate
      ? Promise.resolve([] as LibRow[])
      : all<LibRow>(
          "select mal_id, title, image, progress, episodes from library where user_id = ? and status = 'watching' order by updated_at desc limit 12",
          u.id,
        ),
  ]);

  return Response.json(
    {
      profile: {
        handle: u.handle,
        displayName: u.display_name,
        avatar: u.avatar_url || null,
        banner: u.banner_url || null,
        bio: u.bio || "",
        pronouns: u.pronouns || "",
        accent: u.accent || "#e8679a",
        status: u.status_text || "",
      },
      stats: { completed: stats.completed, watching: stats.watching, episodes: stats.episodes, hours: stats.hours, mean: stats.mean, rated: stats.rated },
      listsPrivate,
      watching,
    },
    { headers: CORS },
  );
}
