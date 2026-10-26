import { memberOr401 } from "@/lib/auth";
import { all, db, first, run } from "@/lib/db";

// Member collections (mixed anime + manga lists). GET shapes:
//   (no params)        → my collections, with item count + up to 4 preview covers
//   ?user=<handle>     → that member's PUBLIC collections (for their profile)
//   ?id=<id>           → one collection + its items (public, or mine)
//   ?picker=<kind>:<ref> → my collections, each flagged whether it holds that item
// POST dispatches on `op`: create | rename | visibility | delete | add | remove.

const MAX_COLLECTIONS = 50;
const MAX_ITEMS = 500;
const isKind = (k: unknown): k is "anime" | "manga" => k === "anime" || k === "manga";

interface Col { id: string; name: string; visibility: string; updated_at: number; count: number }

// Attach up to 4 recent covers to each collection row.
async function withPreviews(cols: Col[]): Promise<(Col & { covers: string[] })[]> {
  const ids = cols.map((c) => c.id);
  if (!ids.length) return [];
  const items = await all<{ collection_id: string; cover: string | null }>(
    `select collection_id, cover from collection_items where collection_id in (${ids.map(() => "?").join(",")}) and cover is not null order by added_at desc`,
    ...ids,
  ).catch(() => []);
  const by = new Map<string, string[]>();
  for (const it of items) {
    if (!it.cover) continue;
    const arr = by.get(it.collection_id) ?? [];
    if (arr.length < 4) { arr.push(it.cover); by.set(it.collection_id, arr); }
  }
  return cols.map((c) => ({ ...c, covers: by.get(c.id) ?? [] }));
}

const listFor = (userId: string, publicOnly: boolean) =>
  all<Col>(
    `select c.id, c.name, c.visibility, c.updated_at,
            (select count(*) from collection_items i where i.collection_id = c.id) as count
     from collections c where c.user_id = ?1 ${publicOnly ? "and c.visibility = 'public'" : ""}
     order by c.updated_at desc limit 100`,
    userId,
  );

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const sp = new URL(req.url).searchParams;

  const id = sp.get("id");
  if (id) {
    const c = await first<{ id: string; user_id: string; name: string; visibility: string; created_at: number; handle: string; display_name: string; avatar_url: string | null; accent: string }>(
      `select c.id, c.user_id, c.name, c.visibility, c.created_at, u.handle, u.display_name, u.avatar_url, u.accent
       from collections c join users u on u.id = c.user_id where c.id = ?`,
      id,
    );
    if (!c) return Response.json({ error: "not found" }, { status: 404 });
    if (c.visibility === "private" && c.user_id !== me.id) return Response.json({ error: "not found" }, { status: 404 });
    const items = await all<{ kind: string; ref_id: string; title: string; cover: string | null; added_at: number }>(
      "select kind, ref_id, title, cover, added_at from collection_items where collection_id = ? order by added_at desc",
      id,
    );
    return Response.json({ collection: c, items, mine: c.user_id === me.id }, { headers: { "cache-control": "no-store" } });
  }

  const picker = sp.get("picker");
  if (picker) {
    const idx = picker.indexOf(":");
    const kind = picker.slice(0, idx);
    const ref = picker.slice(idx + 1);
    if (!isKind(kind) || !ref) return Response.json({ collections: [] });
    const cols = await all<{ id: string; name: string; visibility: string; has: number }>(
      `select c.id, c.name, c.visibility,
              exists(select 1 from collection_items i where i.collection_id = c.id and i.kind = ?2 and i.ref_id = ?3) as has
       from collections c where c.user_id = ?1 order by c.updated_at desc limit 100`,
      me.id, kind, ref,
    );
    return Response.json({ collections: cols }, { headers: { "cache-control": "no-store" } });
  }

  const handle = sp.get("user");
  if (handle) {
    const u = await first<{ id: string }>("select id from users where handle = ? collate nocase", handle);
    if (!u) return Response.json({ collections: [] });
    return Response.json({ collections: await withPreviews(await listFor(u.id, u.id !== me.id)) }, { headers: { "cache-control": "no-store" } });
  }

  return Response.json({ collections: await withPreviews(await listFor(me.id, false)) }, { headers: { "cache-control": "no-store" } });
}

async function ownsOr404(id: string, userId: string): Promise<boolean> {
  const c = await first<{ user_id: string }>("select user_id from collections where id = ?", id);
  return !!c && c.user_id === userId;
}
const touch = (id: string) => run("update collections set updated_at = unixepoch() where id = ?", id);

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as {
    op?: string; id?: string; name?: string; visibility?: string; kind?: string; refId?: string; title?: string; cover?: string | null;
  };
  const op = b.op;

  if (op === "create") {
    const name = String(b.name ?? "").trim().slice(0, 60);
    if (!name) return Response.json({ error: "name it first" }, { status: 400 });
    const n = await first<{ n: number }>("select count(*) as n from collections where user_id = ?", me.id);
    if ((n?.n ?? 0) >= MAX_COLLECTIONS) return Response.json({ error: "that's a lot of lists — delete one first" }, { status: 400 });
    const id = crypto.randomUUID();
    const visibility = b.visibility === "private" ? "private" : "public";
    await run("insert into collections (id, user_id, name, visibility) values (?, ?, ?, ?)", id, me.id, name, visibility);
    return Response.json({ id, name, visibility });
  }

  if (!b.id || !(await ownsOr404(b.id, me.id))) return Response.json({ error: "not found" }, { status: 404 });

  switch (op) {
    case "rename": {
      const name = String(b.name ?? "").trim().slice(0, 60);
      if (!name) return Response.json({ error: "name it first" }, { status: 400 });
      await run("update collections set name = ?, updated_at = unixepoch() where id = ?", name, b.id);
      return Response.json({ ok: true, name });
    }
    case "visibility": {
      const v = b.visibility === "private" ? "private" : "public";
      await run("update collections set visibility = ?, updated_at = unixepoch() where id = ?", v, b.id);
      return Response.json({ ok: true, visibility: v });
    }
    case "delete":
      await run("delete from collections where id = ?", b.id);
      return Response.json({ ok: true });
    case "add": {
      if (!isKind(b.kind) || !b.refId) return Response.json({ error: "bad item" }, { status: 400 });
      const n = await first<{ n: number }>("select count(*) as n from collection_items where collection_id = ?", b.id);
      if ((n?.n ?? 0) >= MAX_ITEMS) return Response.json({ error: "this list is full" }, { status: 400 });
      await run(
        `insert into collection_items (collection_id, kind, ref_id, title, cover) values (?, ?, ?, ?, ?)
         on conflict(collection_id, kind, ref_id) do update set title = excluded.title, cover = excluded.cover`,
        b.id, b.kind, String(b.refId).slice(0, 80), String(b.title ?? "").slice(0, 200), b.cover ?? null,
      );
      await touch(b.id);
      return Response.json({ ok: true });
    }
    case "remove": {
      if (!isKind(b.kind) || !b.refId) return Response.json({ error: "bad item" }, { status: 400 });
      await run("delete from collection_items where collection_id = ? and kind = ? and ref_id = ?", b.id, b.kind, String(b.refId));
      await touch(b.id);
      return Response.json({ ok: true });
    }
    default:
      return Response.json({ error: "unknown op" }, { status: 400 });
  }
}
