// Which episodes are filler, from animefillerlist.com, where people curate it episode by episode
// (manga canon / mixed canon+filler / anime canon / filler). MAL's own flag is sparse and some
// sites guess from it, which is how plain canon episodes end up wearing a filler tag.
//
// Accuracy over coverage: a show is matched on its exact title (nothing fuzzy), and the list is
// only used when its episode count agrees with this entry's. A season of a long franchise (their
// list numbers the whole run, ours restarts every season) therefore gets no tags rather than the
// wrong ones. Cached in D1: the index for a week, each show for a day.
import { db, now } from "./db";

export type FillerKind = "filler" | "mixed" | "anime";
export type FillerMap = Record<number, FillerKind>;

const BASE = "https://www.animefillerlist.com";
const CLASS_KIND: Record<string, FillerKind | undefined> = { filler: "filler", mixed_canon: "mixed", anime_canon: "anime" };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/&#0?39;|&amp;/g, (m) => (m === "&amp;" ? "&" : "'")).replace(/[^\p{L}\p{N}]+/gu, " ").trim();

async function cached<T>(key: string, ttl: number, load: () => Promise<T | null>): Promise<T | null> {
  let stale: T | null = null;
  try {
    const row = await (await db()).prepare("select body, fetched_at from jikan_cache where key = ?").bind(key).first<{ body: string; fetched_at: number }>();
    if (row) { stale = JSON.parse(row.body) as T; if (now() - row.fetched_at < ttl) return stale; }
  } catch { /* no db */ }
  const fresh = await load().catch(() => null);
  if (!fresh) return stale;
  try { await (await db()).prepare("insert into jikan_cache (key, body, fetched_at) values (?, ?, ?) on conflict(key) do update set body = excluded.body, fetched_at = excluded.fetched_at").bind(key, JSON.stringify(fresh), now()).run(); } catch { /* best effort */ }
  return fresh;
}

const get = async (path: string) => {
  const r = await fetch(BASE + path, { headers: { "user-agent": "cupcake.gg/1.0 (+https://cupcake.gg)", accept: "text/html" }, signal: AbortSignal.timeout(10_000) });
  return r.ok ? r.text() : null;
};

/** normalised title → slug, for every show on the list ("Title (Alt Title)" is indexed under both) */
export function parseIndex(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<a href="\/shows\/([^"/]+)"[^>]*>([^<]+)<\/a>/g)) {
    const slug = decodeURIComponent(m[1]);
    const text = m[2].trim();
    const paren = /^(.*?)\s*\((.+)\)\s*$/.exec(text);
    for (const t of paren ? [text, paren[1], paren[2]] : [text]) { const k = norm(t); if (k && !(k in out)) out[k] = slug; }
  }
  return out;
}

/** episode number → kind, canon episodes omitted */
export function parseShow(html: string): { map: FillerMap; total: number } {
  const map: FillerMap = {};
  let total = 0;
  for (const m of html.matchAll(/<tr class="([^"]*)"[^>]*id="eps-(\d+)"/g)) {
    const n = Number(m[2]);
    total = Math.max(total, n);
    const kind = m[1].split(/\s+/).map((c) => CLASS_KIND[c]).find(Boolean);
    if (kind) map[n] = kind;
  }
  return { map, total };
}

/** Filler kinds for a show, or null when the list doesn't have it or doesn't line up. */
export async function getFillers(titles: (string | null | undefined)[], episodes: number | null): Promise<FillerMap | null> {
  const index = await cached<Record<string, string>>("afl:index", 7 * 86400, async () => { const h = await get("/shows"); const i = h ? parseIndex(h) : null; return i && Object.keys(i).length > 50 ? i : null; });
  if (!index) return null;
  let slug: string | undefined;
  for (const t of titles) { if (t && index[norm(t)]) { slug = index[norm(t)]; break; } }
  if (!slug) return null;
  const show = await cached<{ map: FillerMap; total: number }>(`afl:show:${slug}`, 86400, async () => { const h = await get(`/shows/${slug}`); const p = h ? parseShow(h) : null; return p && p.total > 0 ? p : null; });
  if (!show) return null;
  // their list must be this entry's own episode run (long-runners with no fixed count are fine)
  if (episodes != null && Math.abs(show.total - episodes) > 3) return null;
  return show.map;
}
