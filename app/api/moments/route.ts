import { memberOr401 } from "@/lib/auth";
import { all, first, run } from "@/lib/db";
import { REACTIONS } from "@/lib/reactions";

// Timeline "moment" reactions: an emoji pinned to a second of an episode, drawn
// on the seek bar so you can see where everyone lost it.

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const u = new URL(req.url);
  const malId = Number(u.searchParams.get("malId")), ep = Number(u.searchParams.get("ep"));
  let moments: { at: number; emoji: string }[] = [];
  try {
    moments = await all<{ at: number; emoji: string }>(
      "select at_s as at, emoji from episode_moments where mal_id = ? and episode = ? order by at_s limit 400",
      malId, ep,
    );
  } catch {
    /* table not ready */
  }
  return Response.json({ moments }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { malId?: number; ep?: number; at?: number; emoji?: string };
  const malId = Number(b.malId), ep = Number(b.ep), at = Number(b.at);
  if (!Number.isInteger(malId) || !Number.isInteger(ep) || !Number.isFinite(at) || at < 0 || !REACTIONS.includes(String(b.emoji))) {
    return Response.json({ error: "bad" }, { status: 400 });
  }
  try {
    // keep it from being spammed: cap each member to 40 moments per episode
    const mine = await first<{ n: number }>("select count(*) as n from episode_moments where mal_id = ? and episode = ? and user_id = ?", malId, ep, me.id);
    if ((mine?.n ?? 0) >= 40) return Response.json({ error: "enough" }, { status: 429 });
    await run("insert into episode_moments (mal_id, episode, user_id, at_s, emoji) values (?, ?, ?, ?, ?)", malId, ep, me.id, Math.round(at), b.emoji);
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  return Response.json({ ok: true });
}
