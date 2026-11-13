import { db, now } from "./db";

// Titles the player could not start. When a viewer's player sits on "Fetching media" and gives up, the page reports it here, so a
// title that nobody can play is noticed (and shown honestly) instead of sending every visitor through a long wait. Kept in the shared
// cache table (key / body / fetched_at), so it needs no migration. A report is the SAME member counting once: reporters are stored as a short
// hash of their id, never the id, and the whole record expires after a week without a new report.
const WINDOW = 7 * 86400;
/** how many different members must report a title before the page stops auto-loading its player */
export const MISSING_THRESHOLD = 3;

const keyOf = (imdb: string, se: number, ep: number) => `missing:${imdb}:${se}:${ep}`;
async function who(userId: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`missing:${userId}`));
  return Array.from(new Uint8Array(d).slice(0, 5), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function read(imdb: string, se: number, ep: number): Promise<{ u: string[]; at: number } | null> {
  try {
    const row = await (await db()).prepare("select body, fetched_at from jikan_cache where key = ?").bind(keyOf(imdb, se, ep)).first<{ body: string; fetched_at: number }>();
    if (!row || now() - row.fetched_at > WINDOW) return null;
    const j = JSON.parse(row.body) as { u?: string[] };
    return Array.isArray(j.u) ? { u: j.u.filter((x) => typeof x === "string").slice(0, 50), at: row.fetched_at } : null;
  } catch { return null; }
}

/** Different members who reported this title (or episode) in the last week. */
export async function missingReports(imdb: string, se: number, ep: number): Promise<number> {
  return (await read(imdb, se, ep))?.u.length ?? 0;
}

/** Count this member's report (once per member per week). */
export async function reportMissing(imdb: string, se: number, ep: number, userId: string): Promise<void> {
  try {
    const h = await who(userId);
    const cur = (await read(imdb, se, ep))?.u ?? [];
    if (cur.includes(h)) return;
    const body = JSON.stringify({ u: [...cur, h].slice(-50) });
    await (await db())
      .prepare("insert into jikan_cache (key, body, fetched_at) values (?, ?, ?) on conflict(key) do update set body = excluded.body, fetched_at = excluded.fetched_at")
      .bind(keyOf(imdb, se, ep), body, now()).run();
  } catch { /* best effort: a lost report is harmless */ }
}
