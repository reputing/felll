import { memberOr401 } from "@/lib/auth";
import { db, first } from "@/lib/db";

// Ask for a show to be added to the vault; asking again takes your vote back.
export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { malId?: number; title?: string; image?: string | null };
  const malId = Number(b.malId);
  if (!Number.isInteger(malId) || !b.title) return Response.json({ error: "which anime?" }, { status: 400 });
  const d = await db();
  const had = await first("select 1 from request_votes where mal_id = ? and user_id = ?", malId, me.id);
  if (had) {
    await d.batch([
      d.prepare("delete from request_votes where mal_id = ? and user_id = ?").bind(malId, me.id),
      d.prepare("update requests set votes = max(0, votes - 1) where mal_id = ?").bind(malId),
    ]);
  } else {
    await d.batch([
      d.prepare("insert into requests (mal_id, title, image, requested_by, votes) values (?, ?, ?, ?, 0) on conflict(mal_id) do nothing").bind(malId, String(b.title).slice(0, 200), b.image ?? null, me.id),
      d.prepare("insert into request_votes (mal_id, user_id) values (?, ?)").bind(malId, me.id),
      d.prepare("update requests set votes = votes + 1, status = case when status = 'declined' then 'open' else status end where mal_id = ?").bind(malId),
    ]);
  }
  const r = await first<{ votes: number }>("select votes from requests where mal_id = ?", malId);
  return Response.json({ votes: r?.votes ?? 0, voted: !had });
}

// Admins: mark a request filled (everyone who asked gets a ping) or declined.
export async function PATCH(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  if (!me.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { malId?: number; status?: string };
  if (!["open", "filled", "declined"].includes(String(b.status))) return Response.json({ error: "bad status" }, { status: 400 });
  const d = await db();
  const stmts = [d.prepare("update requests set status = ? where mal_id = ?").bind(b.status, b.malId)];
  if (b.status === "filled") {
    stmts.push(
      d.prepare(
        `insert into notifications (user_id, actor_id, kind, mal_id, text)
         select v.user_id, ?, 'request_filled', v.mal_id, 'added ' || r.title || ' to the vault, go watch!' from request_votes v join requests r on r.mal_id = v.mal_id where v.mal_id = ?`,
      ).bind(me.id, b.malId),
    );
  }
  await d.batch(stmts);
  return Response.json({ ok: true });
}
