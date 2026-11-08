import { memberOr401 } from "@/lib/auth";
import { first, run } from "@/lib/db";
import { parseSubs } from "@/lib/subs";

// A member's own subtitle file for one episode.
//   GET    ?key=a:<malId>:<ep>   (anime episode)  or  m:<movie-or-show slug>[-s1e2]              → { name, body } | { none: true }
//   POST   { key, name, body }              save (replaces the previous file; must parse as subtitles)
//   DELETE ?key=…                           remove it
const KEY = /^(?:a:\d{1,9}:\d{1,5}|m:[\w-]{1,80})$/;
const MAX = 800_000; // characters: a feature-length ASS is well under this

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const key = new URL(req.url).searchParams.get("key") || "";
  if (!KEY.test(key)) return Response.json({ error: "bad key" }, { status: 400 });
  const row = await first<{ name: string; body: string }>("select name, body from user_subs where user_id = ? and key = ?", me.id, key).catch(() => null);
  return Response.json(row ?? { none: true }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { key?: string; name?: string; body?: string };
  const key = String(b.key || ""), body = String(b.body || "");
  if (!KEY.test(key)) return Response.json({ error: "bad key" }, { status: 400 });
  if (!body || body.length > MAX) return Response.json({ error: body ? "that file is too big for subtitles" : "empty file" }, { status: 400 });
  const cues = parseSubs(body);
  if (cues.length < 3) return Response.json({ error: "couldn't read subtitles in that file (use .srt, .vtt or .ass)" }, { status: 400 });
  await run(
    `insert into user_subs (user_id, key, name, body) values (?, ?, ?, ?)
     on conflict(user_id, key) do update set name = excluded.name, body = excluded.body, updated_at = unixepoch()`,
    me.id, key, String(b.name || "subtitles").slice(0, 120), body,
  );
  return Response.json({ ok: true, cues: cues.length });
}

export async function DELETE(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const key = new URL(req.url).searchParams.get("key") || "";
  if (!KEY.test(key)) return Response.json({ error: "bad key" }, { status: 400 });
  await run("delete from user_subs where user_id = ? and key = ?", me.id, key);
  return Response.json({ ok: true });
}
