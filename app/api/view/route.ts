import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Feeds the "trending" sort. One call per episode page load.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { animeId?: unknown } | null;
  const animeId = Number(body?.animeId);
  if (!Number.isInteger(animeId)) return NextResponse.json({ error: "Invalid anime" }, { status: 400 });

  try {
    await db()
      .prepare(
        `INSERT INTO anime_daily_views (anime_id, day, views)
         SELECT ?, date('now'), 1 WHERE EXISTS (SELECT 1 FROM anime WHERE id = ? AND is_published = 1)
         ON CONFLICT (anime_id, day) DO UPDATE SET views = anime_daily_views.views + 1`,
      )
      .bind(animeId, animeId)
      .run();
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
