import { memberOr401 } from "@/lib/auth";
import { all, run } from "@/lib/db";
import { REACTIONS } from "@/lib/reactions";

async function counts(malId: number, ep: number, uid: string) {
  const rows = await all<{ emoji: string; n: number; mine: number }>(
    "select emoji, count(*) as n, max(user_id = ?) as mine from episode_reactions where mal_id = ? and episode = ? group by emoji",
    uid, malId, ep,
  );
  return REACTIONS.map((e) => ({ emoji: e, n: rows.find((r) => r.emoji === e)?.n ?? 0, mine: !!rows.find((r) => r.emoji === e)?.mine }));
}

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const u = new URL(req.url);
  return Response.json({ reactions: await counts(Number(u.searchParams.get("malId")), Number(u.searchParams.get("ep")), me.id) });
}

/** One reaction per member per episode; the same one again takes it back. */
export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { malId?: number; ep?: number; emoji?: string };
  const malId = Number(b.malId), ep = Number(b.ep);
  if (!Number.isInteger(malId) || !Number.isInteger(ep) || !REACTIONS.includes(String(b.emoji))) return Response.json({ error: "bad" }, { status: 400 });
  const r = await run("delete from episode_reactions where mal_id = ? and episode = ? and user_id = ? and emoji = ?", malId, ep, me.id, b.emoji);
  if (!r.meta.changes) {
    await run(
      `insert into episode_reactions (mal_id, episode, user_id, emoji) values (?, ?, ?, ?)
       on conflict(mal_id, episode, user_id) do update set emoji = excluded.emoji`,
      malId, ep, me.id, b.emoji,
    );
  }
  return Response.json({ reactions: await counts(malId, ep, me.id) });
}
