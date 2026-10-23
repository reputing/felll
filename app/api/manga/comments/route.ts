import { currentUser, memberOr401 } from "@/lib/auth";
import { all, db, first } from "@/lib/db";

// Comments on a manga title — the manga counterpart of /api/comments, keyed by
// MangaDex UUID instead of an integer mal id. Same verbs and response shape so
// the shared <Comments> component works unchanged.
//   GET    ?mangaId=&sort=top|new   → { comments, admin }
//   POST   { mangaId, parentId?, body, spoiler? }
//   PATCH  { id, body }   DELETE { id }   PUT { id } (like)
interface Row {
  id: number; parent_id: number | null; body: string; spoiler: number; likes: number; created_at: number; edited_at: number | null; deleted: number;
  handle: string; display_name: string; avatar_url: string | null; accent: string; is_plus: number; liked: number; mine: number;
}

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return Response.json({ error: "sign in" }, { status: 401 });
  const mangaId = (new URL(req.url).searchParams.get("mangaId") || "").trim();
  if (!mangaId) return Response.json({ error: "which manga?" }, { status: 400 });
  const order = new URL(req.url).searchParams.get("sort") === "new" ? "c.created_at desc" : "c.likes desc, c.created_at desc";
  const rows = await all<Row>(
    `select c.id, c.parent_id, c.body, c.spoiler, c.likes, c.created_at, c.edited_at, c.deleted,
            u.handle, u.display_name, u.avatar_url, u.accent, u.is_plus,
            exists(select 1 from manga_comment_likes l where l.comment_id = c.id and l.user_id = ?1) as liked,
            (c.user_id = ?1) as mine
     from manga_comments c join users u on u.id = c.user_id
     where c.manga_id = ?2 order by ${order} limit 300`,
    me.id, mangaId,
  );
  const scrub = (r: Row) => (r.deleted ? { ...r, body: "", handle: "", display_name: "deleted", avatar_url: null } : r);
  return Response.json({ comments: rows.map(scrub), admin: !!me.is_admin }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { mangaId?: string; parentId?: number; body?: string; spoiler?: boolean };
  const mangaId = String(b.mangaId || "").trim();
  const body = String(b.body || "").trim().slice(0, 4000);
  if (!mangaId || !body) return Response.json({ error: "say something first" }, { status: 400 });

  const last = await first<{ created_at: number }>("select created_at from manga_comments where user_id = ? order by created_at desc limit 1", me.id);
  if (last && Date.now() / 1000 - last.created_at < 8) return Response.json({ error: "slow down a sec" }, { status: 429 });

  let parentId: number | null = null;
  if (b.parentId) {
    const parent = await first<{ id: number }>("select id from manga_comments where id = ? and manga_id = ? and parent_id is null and deleted = 0", b.parentId, mangaId);
    if (!parent) return Response.json({ error: "that thread is gone" }, { status: 404 });
    parentId = parent.id;
  }
  const ins = await (await db())
    .prepare("insert into manga_comments (manga_id, user_id, parent_id, body, spoiler) values (?, ?, ?, ?, ?) returning id, created_at")
    .bind(mangaId, me.id, parentId, body, b.spoiler ? 1 : 0)
    .first<{ id: number; created_at: number }>();
  return Response.json({ id: ins!.id, created_at: ins!.created_at });
}

export async function PATCH(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { id?: number; body?: string };
  const body = String(b.body || "").trim().slice(0, 4000);
  if (!body) return Response.json({ error: "empty" }, { status: 400 });
  const r = await (await db()).prepare("update manga_comments set body = ?, edited_at = unixepoch() where id = ? and user_id = ? and deleted = 0").bind(body, b.id, me.id).run();
  return r.meta.changes ? Response.json({ ok: true }) : Response.json({ error: "not yours" }, { status: 403 });
}

export async function DELETE(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { id?: number };
  const r = await (await db()).prepare("update manga_comments set deleted = 1, body = '' where id = ? and (user_id = ? or ? = 1)").bind(b.id, me.id, me.is_admin).run();
  return r.meta.changes ? Response.json({ ok: true }) : Response.json({ error: "not yours" }, { status: 403 });
}

export async function PUT(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { id?: number };
  const c = await first<{ id: number }>("select id from manga_comments where id = ? and deleted = 0", b.id);
  if (!c) return Response.json({ error: "gone" }, { status: 404 });
  const d = await db();
  const added = await d.prepare("insert into manga_comment_likes (comment_id, user_id) values (?, ?) on conflict do nothing").bind(c.id, me.id).run();
  if (added.meta.changes) {
    await d.prepare("update manga_comments set likes = likes + 1 where id = ?").bind(c.id).run();
    return Response.json({ liked: true });
  }
  await d.batch([
    d.prepare("delete from manga_comment_likes where comment_id = ? and user_id = ?").bind(c.id, me.id),
    d.prepare("update manga_comments set likes = max(0, likes - 1) where id = ?").bind(c.id),
  ]);
  return Response.json({ liked: false });
}
