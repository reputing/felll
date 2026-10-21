import { currentUser, memberOr401 } from "@/lib/auth";
import { all, db, first } from "@/lib/db";

// Threads hang off an anime (episode null) or one of its episodes.
//   GET    ?malId=&ep=&sort=top|new      → { comments }
//   POST   { malId, ep?, parentId?, body, spoiler?, title, image? }
//   PATCH  { id, body }                  → edit your own
//   DELETE { id }                        → yours, or anyone's if you're an admin
//   PUT    { id }                        → like / unlike

interface Row {
  id: number; parent_id: number | null; body: string; spoiler: number; likes: number; created_at: number; edited_at: number | null; deleted: number;
  handle: string; display_name: string; avatar_url: string | null; accent: string; is_plus: number; liked: number; mine: number;
}

const epOf = (v: unknown) => (v == null || v === "" ? null : Number.isInteger(Number(v)) ? Number(v) : null);

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return Response.json({ error: "sign in" }, { status: 401 });
  const u = new URL(req.url);
  const malId = Number(u.searchParams.get("malId"));
  if (!Number.isInteger(malId)) return Response.json({ error: "which anime?" }, { status: 400 });
  const ep = epOf(u.searchParams.get("ep"));
  const order = u.searchParams.get("sort") === "new" ? "c.created_at desc" : "c.likes desc, c.created_at desc";
  const rows = await all<Row>(
    `select c.id, c.parent_id, c.body, c.spoiler, c.likes, c.created_at, c.edited_at, c.deleted,
            u.handle, u.display_name, u.avatar_url, u.accent, u.is_plus,
            exists(select 1 from comment_likes l where l.comment_id = c.id and l.user_id = ?1) as liked,
            (c.user_id = ?1) as mine
     from comments c join users u on u.id = c.user_id
     where c.mal_id = ?2 and c.episode is ?3
     order by ${order} limit 300`,
    me.id, malId, ep,
  );
  const scrub = (r: Row) => (r.deleted ? { ...r, body: "", handle: "", display_name: "deleted", avatar_url: null } : r);
  return Response.json({ comments: rows.map(scrub), admin: !!me.is_admin }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { malId?: number; ep?: number; parentId?: number; body?: string; spoiler?: boolean; title?: string; image?: string };
  const malId = Number(b.malId);
  const body = String(b.body || "").trim().slice(0, 4000);
  if (!Number.isInteger(malId) || !body) return Response.json({ error: "say something first" }, { status: 400 });
  const ep = epOf(b.ep);

  // a little breathing room between posts
  const last = await first<{ created_at: number }>("select created_at from comments where user_id = ? order by created_at desc limit 1", me.id);
  if (last && Date.now() / 1000 - last.created_at < 8) return Response.json({ error: "slow down a sec" }, { status: 429 });

  let parent: { id: number; user_id: string } | null = null;
  if (b.parentId) {
    parent = await first("select id, user_id from comments where id = ? and mal_id = ? and episode is ? and parent_id is null and deleted = 0", b.parentId, malId, ep);
    if (!parent) return Response.json({ error: "that thread is gone" }, { status: 404 });
  }

  const d = await db();
  const ins = await d
    .prepare("insert into comments (mal_id, episode, user_id, parent_id, body, spoiler) values (?, ?, ?, ?, ?, ?) returning id, created_at")
    .bind(malId, ep, me.id, parent?.id ?? null, body, b.spoiler ? 1 : 0)
    .first<{ id: number; created_at: number }>();
  const title = String(b.title || "").slice(0, 200);
  const excerpt = body.slice(0, 90);
  const stmts = [
    d.prepare("insert into activity (user_id, kind, mal_id, episode, title, image, detail) values (?, 'comment', ?, ?, ?, ?, ?)").bind(me.id, malId, ep, title, b.image ?? null, b.spoiler ? "(spoiler)" : excerpt),
  ];
  if (parent && parent.user_id !== me.id) {
    stmts.push(d.prepare("insert into notifications (user_id, actor_id, kind, mal_id, episode, comment_id, text) values (?, ?, 'reply', ?, ?, ?, ?)").bind(parent.user_id, me.id, malId, ep, ins!.id, `replied: “${excerpt}”`));
  }
  // @mentions
  const handles = [...new Set([...body.matchAll(/@([a-z0-9_-]{2,32})/gi)].map((m) => m[1].toLowerCase()))].slice(0, 5);
  if (handles.length) {
    const users = await all<{ id: string }>(`select id from users where handle in (${handles.map(() => "?").join(",")}) and id != ?`, ...handles, me.id);
    for (const u of users) {
      if (u.id === parent?.user_id) continue;
      stmts.push(d.prepare("insert into notifications (user_id, actor_id, kind, mal_id, episode, comment_id, text) values (?, ?, 'mention', ?, ?, ?, ?)").bind(u.id, me.id, malId, ep, ins!.id, `mentioned you on ${title}`));
    }
  }
  await d.batch(stmts);
  return Response.json({ id: ins!.id, created_at: ins!.created_at });
}

export async function PATCH(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { id?: number; body?: string };
  const body = String(b.body || "").trim().slice(0, 4000);
  if (!body) return Response.json({ error: "empty" }, { status: 400 });
  const r = await (await db()).prepare("update comments set body = ?, edited_at = unixepoch() where id = ? and user_id = ? and deleted = 0").bind(body, b.id, me.id).run();
  return r.meta.changes ? Response.json({ ok: true }) : Response.json({ error: "not yours" }, { status: 403 });
}

export async function DELETE(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { id?: number };
  const r = await (await db())
    .prepare("update comments set deleted = 1, body = '' where id = ? and (user_id = ? or ? = 1)")
    .bind(b.id, me.id, me.is_admin)
    .run();
  return r.meta.changes ? Response.json({ ok: true }) : Response.json({ error: "not yours" }, { status: 403 });
}

export async function PUT(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { id?: number };
  const c = await first<{ id: number; user_id: string; mal_id: number; episode: number | null }>("select id, user_id, mal_id, episode from comments where id = ? and deleted = 0", b.id);
  if (!c) return Response.json({ error: "gone" }, { status: 404 });
  const d = await db();
  const added = await d.prepare("insert into comment_likes (comment_id, user_id) values (?, ?) on conflict do nothing").bind(c.id, me.id).run();
  if (added.meta.changes) {
    const stmts = [d.prepare("update comments set likes = likes + 1 where id = ?").bind(c.id)];
    if (c.user_id !== me.id) stmts.push(d.prepare("insert into notifications (user_id, actor_id, kind, mal_id, episode, comment_id, text) values (?, ?, 'like', ?, ?, ?, 'liked your comment')").bind(c.user_id, me.id, c.mal_id, c.episode, c.id));
    await d.batch(stmts);
    return Response.json({ liked: true });
  }
  await d.batch([
    d.prepare("delete from comment_likes where comment_id = ? and user_id = ?").bind(c.id, me.id),
    d.prepare("update comments set likes = max(0, likes - 1) where id = ?").bind(c.id),
  ]);
  return Response.json({ liked: false });
}
