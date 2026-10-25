import { memberOr401 } from "@/lib/auth";
import { all, db, first } from "@/lib/db";

// Admin-only: manage which members can view adult (18+) sources (users.adult_ok).

export async function GET() {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  if (!me.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const rows = await all<{ id: string; handle: string; display_name: string; avatar_url: string | null; adult_ok: number }>(
    "select id, handle, display_name, avatar_url, adult_ok from users order by adult_ok desc, handle asc limit 500",
  );
  return Response.json({ users: rows }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  if (!me.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { handle?: string; approve?: boolean };
  const handle = String(b.handle ?? "").trim();
  if (!handle) return Response.json({ error: "which member?" }, { status: 400 });
  const target = await first<{ id: string; adult_ok: number }>("select id, adult_ok from users where handle = ? collate nocase", handle);
  if (!target) return Response.json({ error: "no such member" }, { status: 404 });
  const value = b.approve ? 1 : 0;
  await (await db()).prepare("update users set adult_ok = ? where id = ?").bind(value, target.id).run();
  return Response.json({ handle, adult_ok: value });
}
