// Per-episode art and summaries from ani.zip (https://api.ani.zip), keyed by
// AniList id. Jikan gives us episode titles and air dates but no thumbnails or
// overviews; ani.zip fills that in for the watch-page sidebar. Server-side only.
//
// Like the Anivexa catalog, the response is cached in D1 and shared across
// viewers: a stale copy is served immediately and refreshed in the background,
// so a page never waits on the upstream after the first look.
import { background, db, now } from "./db";

export interface AnizipEpisode {
  number: number;
  title: string | null;
  image: string | null;
  overview: string | null;
  runtime: number | null;
}

/** Episode metadata keyed by episode number. */
export type AnizipEpisodes = Record<number, AnizipEpisode>;

const ANIZIP_TTL = 7 * 86400; // episode art/overviews rarely change

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

function parse(data: Raw): AnizipEpisodes | null {
  const eps = data?.episodes;
  if (!eps || typeof eps !== "object") return null;
  const out: AnizipEpisodes = {};
  for (const [key, value] of Object.entries(eps as Record<string, Raw>)) {
    const n = Number((value as Raw)?.episodeNumber ?? key);
    if (!Number.isFinite(n) || n < 1) continue; // skip "S1", specials, recaps
    const t = (value as Raw)?.title;
    const title = (typeof t === "object" ? t?.en || t?.["x-jat"] || t?.ja : t) ?? null;
    const runtime = Number((value as Raw)?.runtime);
    out[n] = {
      number: n,
      title: title ? String(title) : null,
      image: (value as Raw)?.image ? String((value as Raw).image) : null,
      overview: (value as Raw)?.overview ? String((value as Raw).overview) : null,
      runtime: Number.isFinite(runtime) && runtime > 0 ? runtime : null,
    };
  }
  return Object.keys(out).length ? out : null;
}

async function live(anilistId: number): Promise<AnizipEpisodes | null> {
  try {
    const res = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return parse(await res.json());
  } catch {
    return null;
  }
}

async function refresh(anilistId: number, key: string): Promise<AnizipEpisodes | null> {
  const eps = await live(anilistId);
  if (eps) {
    try {
      await (await db())
        .prepare("insert into jikan_cache (key, body, fetched_at) values (?, ?, ?) on conflict(key) do update set body = excluded.body, fetched_at = excluded.fetched_at")
        .bind(key, JSON.stringify(eps), now())
        .run();
    } catch {
      /* best effort */
    }
  }
  return eps;
}

/** Episode art + overviews for an AniList id, cached in D1. Never throws. */
export async function fetchAnizipEpisodes(anilistId: number | null): Promise<AnizipEpisodes> {
  if (!anilistId) return {};
  const key = `anizip:eps:${anilistId}`;
  let row: { body: string; fetched_at: number } | null = null;
  try {
    row = await (await db()).prepare("select body, fetched_at from jikan_cache where key = ?").bind(key).first();
  } catch {
    /* no db (e.g. build) */
  }
  if (row) {
    if (now() - row.fetched_at >= ANIZIP_TTL) background(refresh(anilistId, key));
    try {
      return JSON.parse(row.body) as AnizipEpisodes;
    } catch {
      /* fall through to a live fetch */
    }
  }
  return (await refresh(anilistId, key)) ?? {};
}
