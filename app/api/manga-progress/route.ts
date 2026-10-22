import { memberOr401 } from "@/lib/auth";
import { all, first, run } from "@/lib/db";

// Where a member left off reading. GET ?mangaId=… for one title's resume point;
// GET with no param for the "continue reading" rail; POST to save.
export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const mangaId = new URL(req.url).searchParams.get("mangaId");
  try {
    if (mangaId) {
      const row = await first("select chapter_id, chapter_num, page from manga_progress where user_id = ? and manga_id = ?", me.id, mangaId);
      return Response.json({ progress: row ?? null }, { headers: { "cache-control": "no-store" } });
    }
    const rows = await all(
      "select manga_id, chapter_id, chapter_num, page, title, cover, updated_at from manga_progress where user_id = ? order by updated_at desc limit 20",
      me.id,
    );
    return Response.json({ reading: rows }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ reading: [], progress: null }, { headers: { "cache-control": "no-store" } });
  }
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { mangaId?: string; chapterId?: string; chapterNum?: string; page?: number; title?: string; cover?: string | null };
  if (!b.mangaId || !b.chapterId) return Response.json({ error: "bad" }, { status: 400 });
  try {
    await run(
      `insert into manga_progress (user_id, manga_id, chapter_id, chapter_num, page, title, cover, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, unixepoch())
       on conflict(user_id, manga_id) do update set
         chapter_id = excluded.chapter_id, chapter_num = excluded.chapter_num, page = excluded.page,
         title = excluded.title, cover = excluded.cover, updated_at = unixepoch()`,
      me.id, b.mangaId, b.chapterId, String(b.chapterNum ?? ""), Math.max(0, Number(b.page) || 0), String(b.title ?? "").slice(0, 200), b.cover ?? null,
    );
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  return Response.json({ ok: true });
}
