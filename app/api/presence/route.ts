import { memberOr401 } from "@/lib/auth";
import { db } from "@/lib/db";

// Heartbeat: "I'm here (and watching this)". Answers with who else is around.
export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { path?: string; malId?: number; episode?: number; title?: string; mangaId?: string };
  const malId = Number.isInteger(b.malId) ? b.malId! : null;
  const ep = Number.isInteger(b.episode) ? b.episode! : null;
  const mangaId = typeof b.mangaId === "string" && b.mangaId ? b.mangaId.slice(0, 80) : null;
  const title = malId || mangaId ? String(b.title || "").slice(0, 200) : null;
  const d = await db();
  const [, , people] = await d.batch([
    d
      .prepare(
        `insert into presence (user_id, path, mal_id, episode, title, manga_id, updated_at) values (?, ?, ?, ?, ?, ?, unixepoch())
         on conflict(user_id) do update set path = excluded.path, mal_id = excluded.mal_id, episode = excluded.episode,
           title = excluded.title, manga_id = excluded.manga_id, updated_at = excluded.updated_at`,
      )
      .bind(me.id, String(b.path || "/").slice(0, 200), malId, ep, title, mangaId),
    d.prepare("update users set last_seen = unixepoch() where id = ?").bind(me.id),
    d.prepare(
      `select u.handle, u.display_name, u.avatar_url, p.mal_id, p.episode, p.title, p.manga_id
       from presence p join users u on u.id = p.user_id
       where p.updated_at > unixepoch() - 90 order by (p.mal_id is null and p.manga_id is null), p.updated_at desc limit 60`,
    ),
  ]);
  return Response.json({ count: people.results.length, people: people.results }, { headers: { "cache-control": "no-store" } });
}
