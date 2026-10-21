import { NextResponse, type NextRequest } from "next/server";
import { searchAnime } from "@/lib/catalog";
import { durationLabel, formatLabel } from "@/lib/format";

// Instant suggestions for the header search box.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 100);
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const lang = req.cookies.get("title_lang")?.value === "jp" ? "jp" : "en";
  const { results } = await searchAnime({ q, pageSize: 6 });

  return NextResponse.json(
    {
      results: results.map((a) => ({
        slug: a.slug,
        title: lang === "en" ? a.title_english || a.title_romaji : a.title_romaji,
        cover_url: a.cover_url,
        meta: [formatLabel(a.format), a.season_year, durationLabel(a.duration_minutes)].filter(Boolean).join(" · "),
      })),
    },
    { headers: { "cache-control": "public, max-age=30, s-maxage=300", vary: "cookie" } },
  );
}
