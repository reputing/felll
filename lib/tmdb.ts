// TMDB id resolution + embed-player URLs. Moviebox only hands back its own
// subject id, but embed players are keyed by TMDB id — so we resolve a title ->
// TMDB id once (cached in D1) and build embed URLs from it.
//
// Lights up only when TMDB_API_KEY (a v3 key) is set; otherwise every call
// soft-fails to [] and the movie player just uses the native Moviebox stream.
//
// Several providers are offered as separate "servers": embed hosts come and go,
// so if one is down the viewer taps another — same idea as the anime servers.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { background, db, now } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

export interface MovieEmbed { name: string; url: string }

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

export async function embedEnabled(): Promise<boolean> {
  return (await apiKey()) !== null;
}

// Strip the noise Moviebox bakes into titles ("Rick and Morty S1-S9",
// "Invincible S1-S4", "Foo (2013)", "Bar: Complete Series") so TMDB search
// actually matches.
function cleanTitle(t: string): string {
  return t
    .replace(/\s*[\[(][^\])]*[\])]\s*/g, " ")          // (2013), [Dual Audio]
    .replace(/\s+s\d+\s*[-–—]\s*s?\d+\b.*$/i, "")        // S1-S9
    .replace(/\s+season\s+\d+\b.*$/i, "")                // Season 3 ...
    .replace(/\s*[-:–—]\s*(the\s+)?complete\b.*$/i, "")  // - Complete Series
    .replace(/\b(complete series|full series|collection|uncut|remastered|extended)\b.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// --- D1 cache --------------------------------------------------------------
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

/** Resolve a title to a TMDB id. Searches tv for series, movie otherwise, and
 *  retries the movie endpoint for a series that TMDB files as a film. */
export async function resolveTmdbId(title: string, year: number | null, isSeries: boolean): Promise<number | null> {
  const key = await apiKey();
  const q = cleanTitle(title);
  if (!key || !q) return null;
  const search = async (kind: "tv" | "movie", withYear: boolean): Promise<number | null> => {
    const yr = withYear && year ? `&${kind === "tv" ? "first_air_date_year" : "year"}=${year}` : "";
    const url = `https://api.themoviedb.org/3/search/${kind}?api_key=${key}&query=${encodeURIComponent(q)}${yr}&include_adult=false`;
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const hit = ((await res.json()) as Raw)?.results?.find((r: Raw) => r?.id);
      return hit ? Number(hit.id) : null;
    } catch { return null; }
  };
  return cached(`tmdb:${isSeries ? "tv" : "movie"}:${q.toLowerCase()}:${year ?? ""}`, async () => {
    const primary = isSeries ? "tv" : "movie";
    const other = isSeries ? "movie" : "tv";
    // year-matched first, then loosen, then try the other media type
    return (await search(primary, true)) ?? (await search(primary, false)) ?? (await search(other, false));
  });
}

// Embed providers. Each is keyed by TMDB id; patterns differ per host. VidCore's
// base is overridable (VIDCORE_EMBED_BASE) since the exact host moves.
async function providers(): Promise<{ name: string; movie: (id: number) => string; tv: (id: number, s: number, e: number) => string }[]> {
  const e = await env();
  const vidcore = (e.VIDCORE_EMBED_BASE || process.env.VIDCORE_EMBED_BASE || "https://vidcore.org").replace(/\/+$/, "");
  return [
    { name: "VidSrc", movie: (id) => `https://vidsrc.xyz/embed/movie/${id}`, tv: (id, s, ep) => `https://vidsrc.xyz/embed/tv/${id}/${s}/${ep}` },
    { name: "VidLink", movie: (id) => `https://vidlink.pro/movie/${id}`, tv: (id, s, ep) => `https://vidlink.pro/tv/${id}/${s}/${ep}` },
    { name: "2Embed", movie: (id) => `https://www.2embed.cc/embed/${id}`, tv: (id, s, ep) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${ep}` },
    { name: "VidCore", movie: (id) => `${vidcore}/embed/movie/${id}`, tv: (id, s, ep) => `${vidcore}/embed/tv/${id}/${s}/${ep}` },
  ];
}

/** Embed players for a title (one per provider), or [] when TMDB isn't
 *  configured / no match. */
export async function movieEmbeds(title: string, year: number | null, isSeries: boolean, se?: number, ep?: number): Promise<MovieEmbed[]> {
  const id = await resolveTmdbId(title, year, isSeries);
  if (id == null) return [];
  const list = await providers();
  return list.map((p) => ({ name: p.name, url: isSeries ? p.tv(id, se || 1, ep || 1) : p.movie(id) }));
}
