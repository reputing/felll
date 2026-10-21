import { memberOr401 } from "@/lib/auth";
import { db, first } from "@/lib/db";

// Follow or unfollow a member by handle.
export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { handle?: string };
  const them = await first<{ id: string; handle: string }>("select id, handle from users where handle = ?", String(b.handle || ""));
  if (!them || them.id === me.id) return Response.json({ error: "can’t follow that" }, { status: 400 });
  const d = await db();
  const had = await first("select 1 from follows where follower_id = ? and followee_id = ?", me.id, them.id);
  if (had) {
    await d.prepare("delete from follows where follower_id = ? and followee_id = ?").bind(me.id, them.id).run();
  } else {
    await d.batch([
      d.prepare("insert into follows (follower_id, followee_id) values (?, ?) on conflict do nothing").bind(me.id, them.id),
      d.prepare("insert into notifications (user_id, actor_id, kind, text) values (?, ?, 'follow', 'started following you')").bind(them.id, me.id),
      d.prepare("insert into activity (user_id, kind, detail) values (?, 'follow', ?)").bind(me.id, them.handle),
    ]);
  }
  const n = await first<{ n: number }>("select count(*) as n from follows where followee_id = ?", them.id);
  return Response.json({ following: !had, followers: n?.n ?? 0 });
}
