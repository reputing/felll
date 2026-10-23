import { memberOr401 } from "@/lib/auth";
import { all, first, run } from "@/lib/db";

// A member's saved manga (the manga equivalent of /api/library).
//   GET            → { library: [...] }         all saved manga
//   GET  ?id=<uuid> → { saved, status, favorite } one title's state
//   POST { mangaId, title?, cover?, status?, favorite? }  save / update
//   POST { mangaId, remove: true }                        unsave
const STATUSES = ["reading", "planning", "completed", "paused", "dropped"];

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const row = await first<{ status: string | null; favorite: number }>(
      "select status, favorite from manga_library where user_id = ? and manga_id = ?",
      me.id, id,
    );
    return Response.json({ saved: !!row, status: row?.status ?? null, favorite: !!row?.favorite }, { headers: { "cache-control": "no-store" } });
  }
  const library = await all(
    "select manga_id, status, favorite, title, cover, updated_at from manga_library where user_id = ? order by updated_at desc limit 500",
    me.id,
  );
  return Response.json({ library }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { mangaId?: string; title?: string; cover?: string | null; status?: string | null; favorite?: boolean; remove?: boolean };
  const mangaId = String(b.mangaId || "").trim();
  if (!mangaId) return Response.json({ error: "which manga?" }, { status: 400 });
  if (b.remove) {
    await run("delete from manga_library where user_id = ? and manga_id = ?", me.id, mangaId);
    return Response.json({ ok: true, saved: false }, { headers: { "cache-control": "no-store" } });
  }
  const status = b.status && STATUSES.includes(b.status) ? b.status : "reading";
  await run(
    `insert into manga_library (user_id, manga_id, status, favorite, title, cover) values (?, ?, ?, ?, ?, ?)
     on conflict(user_id, manga_id) do update set status = excluded.status, favorite = excluded.favorite,
       title = excluded.title, cover = excluded.cover, updated_at = unixepoch()`,
    me.id, mangaId, status, b.favorite ? 1 : 0, String(b.title || "").slice(0, 300), b.cover ?? null,
  );
  return Response.json({ ok: true, saved: true, status }, { headers: { "cache-control": "no-store" } });
}
