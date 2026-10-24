import { memberOr401 } from "@/lib/auth";
import { all, db, first } from "@/lib/db";

// The global chat room. Members only.
//   GET  ?after=<id>  → messages after that id (polling), else the last 50
//   POST { body }     → send a message
interface Msg {
  id: number; body: string; created_at: number;
  handle: string; display_name: string; avatar_url: string | null; accent: string; is_plus: number; mine: number;
}

const SELECT =
  `select c.id, c.body, c.created_at, u.handle, u.display_name, u.avatar_url, u.accent, u.is_plus, (c.user_id = ?1) as mine
   from chat_messages c join users u on u.id = c.user_id`;

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const after = Number(new URL(req.url).searchParams.get("after")) || 0;
  let messages: Msg[];
  try {
    messages = after
      ? await all<Msg>(`${SELECT} where c.id > ?2 order by c.id asc limit 100`, me.id, after)
      : (await all<Msg>(`${SELECT} order by c.id desc limit 50`, me.id)).reverse();
  } catch {
    messages = []; // table not migrated yet
  }
  return Response.json({ messages }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { body?: string };
  const body = String(b.body || "").trim().replace(/\s+/g, " ").slice(0, 500);
  if (!body) return Response.json({ error: "say something" }, { status: 400 });
  // a little breathing room between messages
  const last = await first<{ created_at: number }>("select created_at from chat_messages where user_id = ? order by id desc limit 1", me.id).catch(() => null);
  if (last && Date.now() / 1000 - last.created_at < 2) return Response.json({ error: "slow down a sec" }, { status: 429 });
  const ins = await (await db())
    .prepare("insert into chat_messages (user_id, body) values (?, ?) returning id, created_at")
    .bind(me.id, body)
    .first<{ id: number; created_at: number }>();
  return Response.json({
    message: { id: ins!.id, body, created_at: ins!.created_at, handle: me.handle, display_name: me.display_name, avatar_url: me.avatar_url, accent: me.accent, is_plus: me.is_plus, mine: 1 } satisfies Msg,
  });
}
