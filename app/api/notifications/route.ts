import { memberOr401 } from "@/lib/auth";
import { db } from "@/lib/db";

// Opening the bell: the latest 30, then mark them read.
export async function POST() {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const d = await db();
  const [rows] = await d.batch([
    d
      .prepare(
        `select n.id, n.kind, n.text, n.read, n.created_at, n.mal_id, n.episode, n.comment_id, u.handle, u.avatar_url
         from notifications n left join users u on u.id = n.actor_id
         where n.user_id = ? order by n.created_at desc limit 30`,
      )
      .bind(me.id),
    d.prepare("update notifications set read = 1 where user_id = ? and read = 0").bind(me.id),
  ]);
  const notes = (rows.results as { kind: string; mal_id: number | null; episode: number | null; comment_id: number | null; handle: string | null }[]).map((n) => ({
    ...n,
    href:
      n.kind === "follow" && n.handle ? `/u/${n.handle}`
      : n.mal_id && n.episode ? `/watch/${n.mal_id}/${n.episode}${n.comment_id ? `#c${n.comment_id}` : ""}`
      : n.mal_id ? `/anime/${n.mal_id}${n.comment_id ? `#c${n.comment_id}` : ""}`
      : "/home",
  }));
  return Response.json({ notes });
}
