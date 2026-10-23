// TMDB id resolution + VidCore embed URLs. Moviebox only hands back its own
// subject id, but embed players (VidCore et al.) are keyed by TMDB id — so we
// resolve a title -> TMDB id once (cached in D1) and build an embed URL from it.
//
// Lights up only when TMDB_API_KEY (a v3 key) is set; otherwise every call
// soft-fails to null and the movie player just uses the native Moviebox stream.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { background, db, now } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

async function env(): Promise<Record<string, string | undefined>> {
  try {
    return (await getCloudflareContext({ async: true })).env as unknown as Record<string, string | undefined>;
  } catch {
    return process.env as Record<string, string | undefined>;
  }
}

async function apiKey(): Promise<string | null> {
  const e = await env();
  return e.TMDB_API_KEY || process.env.TMDB_API_KEY || null;
}

// The iframe host for VidCore embeds. Overridable without a code change if the
// provider moves — set VIDCORE_EMBED_BASE. Default is the host from its docs.
async function embedBase(): Promise<string> {
  const e = await env();
  return (e.VIDCORE_EMBED_BASE || process.env.VIDCORE_EMBED_BASE || "https://vidcore.created.app").replace(/\/+$/, "");
}

export async function embedEnabled(): Promise<boolean> {
  return (await apiKey()) !== null;
}

// --- D1 cache (shared across viewers) --------------------------------------
async function cached<T>(key: string, build: () => Promise<T | null>, ttl = 30 * 86400): Promise<T | null> {
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

/** Resolve a title to a TMDB id. Searches tv for series, movie otherwise. */
export async function resolveTmdbId(title: string, year: number | null, isSeries: boolean): Promise<number | null> {
  const key = await apiKey();
  if (!key || !title.trim()) return null;
  const kind = isSeries ? "tv" : "movie";
  const cacheKey = `tmdb:${kind}:${title.toLowerCase().trim()}:${year ?? ""}`;
  return cached(cacheKey, async () => {
    const yr = year ? `&${isSeries ? "first_air_date_year" : "year"}=${year}` : "";
    const url = `https://api.themoviedb.org/3/search/${kind}?api_key=${key}&query=${encodeURIComponent(title.trim())}${yr}&include_adult=false`;
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const data = (await res.json()) as Raw;
      const hit = (data?.results ?? []).find((r: Raw) => r?.id);
      return hit ? Number(hit.id) : null;
    } catch { return null; }
  });
}

export interface MovieEmbed { name: string; url: string }

/** A VidCore embed for a title, or null when TMDB isn't configured / no match. */
export async function vidcoreEmbed(title: string, year: number | null, isSeries: boolean, se?: number, ep?: number): Promise<MovieEmbed | null> {
  const id = await resolveTmdbId(title, year, isSeries);
  if (id == null) return null;
  const b = await embedBase();
  const url = isSeries ? `${b}/embed/tv/${id}/${se || 1}/${ep || 1}` : `${b}/embed/movie/${id}`;
  return { name: "VidCore", url };
}
