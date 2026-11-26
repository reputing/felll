// A small shared cache for the movies layer: D1 first (shared by every viewer and every isolate), stale copy served at
// once with a background refresh when it has aged out. A build that fails never overwrites a good copy, which is what
// keeps the section browsable through an upstream outage.
import { background, db, now } from "./db";

export async function cached<T>(key: string, build: () => Promise<T | null>, ttl = 6 * 3600): Promise<T | null> {
  let row: { body: string; fetched_at: number } | null = null;
  try { row = await (await db()).prepare("select body, fetched_at from jikan_cache where key = ?").bind(key).first(); } catch { /* no db */ }
  if (row) {
    if (now() - row.fetched_at >= ttl) background(refresh(key, build));
    try { return JSON.parse(row.body) as T; } catch { /* fall through */ }
  }
  return refresh(key, build);
}

async function refresh<T>(key: string, build: () => Promise<T | null>): Promise<T | null> {
  const data = await build();
  if (data != null) {
    try {
      await (await db())
        .prepare("insert into jikan_cache (key, body, fetched_at) values (?, ?, ?) on conflict(key) do update set body = excluded.body, fetched_at = excluded.fetched_at")
        .bind(key, JSON.stringify(data), now()).run();
    } catch { /* best effort */ }
  }
  return data;
}
