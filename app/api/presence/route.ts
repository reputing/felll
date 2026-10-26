import { memberOr401 } from "@/lib/auth";
import { db, first } from "@/lib/db";

// Heartbeat: "I'm here (and watching this)". Answers with who else is around.
export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { path?: string; malId?: number; episode?: number; title?: string; mangaId?: string };
  const malId = Number.isInteger(b.malId) ? b.malId! : null;
  const ep = Number.isInteger(b.episode) ? b.episode! : null;
  let mangaId = typeof b.mangaId === "string" && b.mangaId ? b.mangaId.slice(0, 80) : null;
  let title = malId || mangaId ? String(b.title || "").slice(0, 200) : null;
  // "Hide my reading": drop the manga title/id before it's stored, so it never
  // reaches the online list others see. Anime watching is unaffected. (Adult
  // /read/* reading is already never sent to presence.)
  if (me.hide_reading && mangaId && !malId) { mangaId = null; title = null; }
  const d = await db();
  // Time-on-site for the leaderboard: credit the gap since this user's last
  // heartbeat, read BEFORE we overwrite it below. Capped at 45s so a reopened or
  // long-idle tab can't inflate it; with the 30s client interval a continuous
  // session accrues at roughly real wall-clock rate. First-ever beat credits 0.
  const prev = await first<{ updated_at: number }>("select updated_at from presence where user_id = ?", me.id);
  const credit = prev ? Math.min(Math.max(Math.floor(Date.now() / 1000) - prev.updated_at, 0), 45) : 0;
  const [, , , people] = await d.batch([
    d
      .prepare(
        `insert into presence (user_id, path, mal_id, episode, title, manga_id, updated_at) values (?, ?, ?, ?, ?, ?, unixepoch())
         on conflict(user_id) do update set path = excluded.path, mal_id = excluded.mal_id, episode = excluded.episode,
           title = excluded.title, manga_id = excluded.manga_id, updated_at = excluded.updated_at`,
      )
      .bind(me.id, String(b.path || "/").slice(0, 200), malId, ep, title, mangaId),
    d.prepare("update users set last_seen = unixepoch() where id = ?").bind(me.id),
    d
      .prepare("insert into time_spent (user_id, day, seconds) values (?, date('now'), ?) on conflict(user_id, day) do update set seconds = seconds + ?")
      .bind(me.id, credit, credit),
    d.prepare(
      `select u.handle, u.display_name, u.avatar_url, p.mal_id, p.episode, p.title, p.manga_id
       from presence p join users u on u.id = p.user_id
       where p.updated_at > unixepoch() - 90 order by (p.mal_id is null and p.manga_id is null), p.updated_at desc limit 60`,
    ),
  ]);
  return Response.json({ count: people.results.length, people: people.results }, { headers: { "cache-control": "no-store" } });
}
