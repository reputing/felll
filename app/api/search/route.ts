import { memberOr401 } from "@/lib/auth";
import { all } from "@/lib/db";
import { formatLabel, searchAnime } from "@/lib/jikan";

/* eslint-disable @typescript-eslint/no-explicit-any */
// A few SFW manga from MangaDex for the palette. Kept non-pornographic — ⌘K is a
// global search, so the 18+ catalogue stays in its own gated section.
async function searchMangaForPalette(q: string): Promise<{ id: string; title: string; image: string | null; sub: string }[]> {
  const rating = "contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica";
  const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(q)}&limit=5&includes[]=cover_art&${rating}&order[relevance]=desc&hasAvailableChapters=true`;
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "cupcake.gg/1.0 (+https://cupcake.gg)" } });
  if (!res.ok) return [];
  const d = (await res.json()) as any;
  return (d.data ?? []).map((m: any) => {
    const t = m.attributes?.title ?? {};
    const title = t.en || t["en-us"] || (Object.values(t)[0] as string) || "Untitled";
    const f = m.relationships?.find((r: any) => r.type === "cover_art")?.attributes?.fileName;
    return {
      id: m.id as string,
      title,
      image: f ? `https://uploads.mangadex.org/covers/${m.id}/${f}.256.jpg` : null,
      sub: ["Manga", m.attributes?.year].filter(Boolean).join(" · "),
    };
  });
}

// The ⌘K palette: a handful of anime and manga plus matching members.
export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ anime: [], manga: [], members: [] });
  const [anime, manga, members] = await Promise.all([
    searchAnime({ q, limit: 6, order_by: "members", sort: "desc" }).catch(() => ({ items: [] })),
    searchMangaForPalette(q).catch(() => []),
    all<{ handle: string; display_name: string; avatar_url: string | null }>(
      "select handle, display_name, avatar_url from users where handle like ? or display_name like ? order by last_seen desc limit 4",
      `${q.replace(/[%_]/g, "")}%`,
      `%${q.replace(/[%_]/g, "")}%`,
    ),
  ]);
  return Response.json(
    {
      anime: anime.items.map((a) => ({ id: a.id, title: a.title, image: a.posterSm, sub: [formatLabel(a), a.year, a.score !== "–" ? `★ ${a.score}` : null].filter(Boolean).join(" · ") })),
      manga,
      members,
    },
    { headers: { "cache-control": "private, max-age=60" } },
  );
}
