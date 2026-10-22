import { memberOr401 } from "@/lib/auth";
import { first, run } from "@/lib/db";
import { episodeAt, getAnime, nextAiring } from "@/lib/jikan";

// Follow an airing show to get an alert when its next episode drops. Toggling
// on records how many episodes have already aired, so the cron only pings about
// new ones (lib/airing.ts, run from /api/warm).
export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { malId?: number };
  const malId = Number(b.malId);
  if (!Number.isInteger(malId)) return Response.json({ error: "bad" }, { status: 400 });

  try {
    const existing = await first("select 1 from show_follows where user_id = ? and mal_id = ?", me.id, malId);
    if (existing) {
      await run("delete from show_follows where user_id = ? and mal_id = ?", me.id, malId);
      return Response.json({ following: false });
    }
    const a = await getAnime(malId).catch(() => null);
    const airedSoFar = a ? (nextAiring(a) ? episodeAt(a, Math.floor(Date.now() / 1000)) ?? 0 : a.episodes ?? 0) : 0;
    await run(
      "insert into show_follows (user_id, mal_id, last_ep) values (?, ?, ?) on conflict(user_id, mal_id) do update set last_ep = excluded.last_ep",
      me.id, malId, airedSoFar,
    );
    return Response.json({ following: true });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
