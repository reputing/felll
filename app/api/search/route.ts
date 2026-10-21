import { memberOr401 } from "@/lib/auth";
import { all } from "@/lib/db";
import { formatLabel, searchAnime } from "@/lib/jikan";

// The ⌘K palette: a handful of anime from Jikan plus matching members.
export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ anime: [], members: [] });
  const [anime, members] = await Promise.all([
    searchAnime({ q, limit: 8, order_by: "members", sort: "desc" }).catch(() => ({ items: [] })),
    all<{ handle: string; display_name: string; avatar_url: string | null }>(
      "select handle, display_name, avatar_url from users where handle like ? or display_name like ? order by last_seen desc limit 4",
      `${q.replace(/[%_]/g, "")}%`,
      `%${q.replace(/[%_]/g, "")}%`,
    ),
  ]);
  return Response.json(
    {
      anime: anime.items.map((a) => ({ id: a.id, title: a.title, image: a.posterSm, sub: [formatLabel(a), a.year, a.score !== "–" ? `★ ${a.score}` : null].filter(Boolean).join(" · ") })),
      members,
    },
    { headers: { "cache-control": "private, max-age=60" } },
  );
}
