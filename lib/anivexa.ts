// Client for the Anivexa aggregator (the "bot"): resolves episode lists and
// stream sources across 12 providers from an AniList ID. This frontend is
// MAL/Jikan-keyed, so we map MAL -> AniList first (via ARM). Server-side only;
// enabled by the ANIVEXA_API_URL var (the deployed anivexa-api worker).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { background, db, now } from "./db";

export const ANIVEXA_PROVIDERS: { slug: string; name: string }[] = [
  { slug: "anikoto", name: "Cupcake" },
  { slug: "animegg", name: "AnimeGG" },
  { slug: "aniwaves", name: "AniWaves" },
  { slug: "reanime", name: "Reanime" },
  { slug: "kaa", name: "KickAssAnime" },
  { slug: "senshi", name: "Senshi" },
  { slug: "mkissa", name: "MKissa" },
  { slug: "anipm", name: "Ani.pm" },
  { slug: "animenosub", name: "AnimeNoSub" },
  { slug: "anizone", name: "AniZone" },
  { slug: "animeonsen", name: "AnimeOnsen" },
  { slug: "animedunya", name: "AnimeDunya" },
];

const PROVIDER_SLUGS = new Set(ANIVEXA_PROVIDERS.map((p) => p.slug));
const PROVIDER_NAME = new Map(ANIVEXA_PROVIDERS.map((p) => [p.slug, p.name]));
const PROVIDER_ORDER = new Map(ANIVEXA_PROVIDERS.map((p, i) => [p.slug, i]));
const META_KEYS = new Set(["page", "type", "mappings", "_unknownProviders"]);

export function isAnivexaProvider(slug: string): boolean {
  return PROVIDER_SLUGS.has(slug);
}

async function base(): Promise<string | null> {
  let url: string | undefined;
  try {
    const env = (await getCloudflareContext({ async: true })).env as unknown as { ANIVEXA_API_URL?: string };
    url = env?.ANIVEXA_API_URL;
  } catch {
    // not in a request context
  }
  if (!url) url = process.env.ANIVEXA_API_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

export async function anivexaEnabled(): Promise<boolean> {
  return (await base()) !== null;
}

async function getJson(path: string): Promise<unknown | null> {
  const b = await base();
  if (!b) return null;
  try {
    const res = await fetch(`${b}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// --- MAL -> AniList -------------------------------------------------------

const malMap = new Map<number, number | null>();

/** Map a MyAnimeList id to an AniList id (via ARM). Cached per isolate. */
export async function malToAnilist(malId: number): Promise<number | null> {
  if (!Number.isInteger(malId)) return null;
  if (malMap.has(malId)) return malMap.get(malId)!;
  let anilist: number | null = null;
  try {
    const r = await fetch(`https://arm.haglund.dev/api/v2/ids?source=myanimelist&id=${malId}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) anilist = ((await r.json()) as { anilist?: number })?.anilist ?? null;
  } catch {
    // leave null
  }
  malMap.set(malId, anilist);
  return anilist;
}

// --- Episode catalog ------------------------------------------------------

export interface AnivexaProviderSummary {
  slug: string;
  name: string;
  sub: number[];
  dub: number[];
}
export interface AnivexaCatalog {
  providers: AnivexaProviderSummary[];
  episodeNumbers: number[];
}

interface RawEpisodeItem {
  number?: number;
}

// The /episodes call fans out to all 12 providers and is slow (several
// seconds), so the result is cached in D1 and shared across viewers. A stale
// copy is served immediately and refreshed in the background.
const CATALOG_TTL = 6 * 3600;

export async function fetchAnivexaCatalog(anilistId: number): Promise<AnivexaCatalog | null> {
  const key = `anivexa:eps:${anilistId}`;
  let row: { body: string; fetched_at: number } | null = null;
  try {
    row = await (await db()).prepare("select body, fetched_at from jikan_cache where key = ?").bind(key).first();
  } catch {
    /* no db (e.g. build) */
  }
  if (row) {
    if (now() - row.fetched_at >= CATALOG_TTL) background(refreshAnivexaCatalog(anilistId, key));
    try {
      return JSON.parse(row.body) as AnivexaCatalog;
    } catch {
      /* fall through to a live fetch */
    }
  }
  return refreshAnivexaCatalog(anilistId, key);
}

async function refreshAnivexaCatalog(anilistId: number, key: string): Promise<AnivexaCatalog | null> {
  const catalog = parseAnivexaCatalog(await getJson(`/episodes/${anilistId}`));
  if (catalog) {
    try {
      await (await db())
        .prepare("insert into jikan_cache (key, body, fetched_at) values (?, ?, ?) on conflict(key) do update set body = excluded.body, fetched_at = excluded.fetched_at")
        .bind(key, JSON.stringify(catalog), now())
        .run();
    } catch {
      /* best effort */
    }
  }
  return catalog;
}

function parseAnivexaCatalog(data: unknown | null): AnivexaCatalog | null {
  if (!data || typeof data !== "object") return null;

  const providers: AnivexaProviderSummary[] = [];
  const nums = new Set<number>();
  const numbersOf = (list: RawEpisodeItem[] | undefined): number[] => {
    if (!Array.isArray(list)) return [];
    const out = list.map((e) => Number(e?.number)).filter((n) => Number.isFinite(n));
    out.forEach((n) => nums.add(n));
    return [...new Set(out)].sort((a, b) => a - b);
  };

  for (const [slug, value] of Object.entries(data as Record<string, unknown>)) {
    if (META_KEYS.has(slug) || !isAnivexaProvider(slug)) continue;
    const episodes = (value as { episodes?: { sub?: RawEpisodeItem[]; dub?: RawEpisodeItem[] } })?.episodes;
    if (!episodes || typeof episodes !== "object") continue;
    const sub = numbersOf(episodes.sub);
    const dub = numbersOf(episodes.dub);
    if (sub.length === 0 && dub.length === 0) continue;
    providers.push({ slug, name: PROVIDER_NAME.get(slug) ?? slug, sub, dub });
  }

  if (providers.length === 0) return null;
  providers.sort((a, b) => (PROVIDER_ORDER.get(a.slug) ?? 99) - (PROVIDER_ORDER.get(b.slug) ?? 99));
  return { providers, episodeNumbers: [...nums].sort((a, b) => a - b) };
}

// --- Stream resolution ----------------------------------------------------

interface RawStream {
  url?: string;
  type?: string;
  server?: string;
  referer?: string;
  headers?: Record<string, string>;
  subtitles?: RawSubtitle[];
  priority?: number;
  isActive?: boolean;
}
interface RawSubtitle {
  url?: string;
  label?: string;
  srclang?: string;
  default?: boolean;
}

export interface ResolvedAnivexaStream {
  type: "hls" | "dash" | "embed";
  url: string; // proxied for hls/dash, raw for embed
  subtitles: { url: string; label: string; lang: string; default: boolean }[];
}

export function anivexaProxyPath(targetUrl: string, headers?: Record<string, string>): string {
  const u = `u=${encodeURIComponent(targetUrl)}`;
  const keys = headers ? Object.keys(headers) : [];
  const h = keys.length ? `&h=${encodeURIComponent(JSON.stringify(headers))}` : "";
  return `/api/anivexa/proxy?${u}${h}`;
}

function streamHeaders(stream: RawStream): Record<string, string> {
  const headers: Record<string, string> = {};
  if (stream.referer) headers.Referer = stream.referer;
  if (stream.headers) Object.assign(headers, stream.headers);
  return headers;
}

function selectStream(streams: RawStream[]): RawStream | null {
  const usable = streams.filter((s) => typeof s.url === "string" && s.url);
  if (usable.length === 0) return null;
  const byType = (type: string) =>
    usable
      .filter((s) => (s.type ?? "hls") === type)
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || (b.priority ?? 0) - (a.priority ?? 0));
  return byType("hls")[0] ?? byType("dash")[0] ?? byType("embed")[0] ?? usable[0];
}

export async function resolveAnivexaStream(
  provider: string,
  anilistId: number,
  audio: string,
  episode: number,
): Promise<ResolvedAnivexaStream | null> {
  if (!isAnivexaProvider(provider) || (audio !== "sub" && audio !== "dub")) return null;
  const data = (await getJson(`/watch/${provider}/${anilistId}/${audio}/${provider}-${episode}`)) as
    | { streams?: RawStream[]; subtitles?: RawSubtitle[] }
    | null;
  if (!data || !Array.isArray(data.streams)) return null;

  const chosen = selectStream(data.streams);
  if (!chosen?.url) return null;

  const type = (chosen.type ?? "hls") as ResolvedAnivexaStream["type"];
  const headers = streamHeaders(chosen);
  const url = type === "embed" ? chosen.url : anivexaProxyPath(chosen.url, headers);

  const rawSubs = chosen.subtitles?.length ? chosen.subtitles : data.subtitles ?? [];
  const subtitles = (rawSubs ?? [])
    .filter((s): s is Required<Pick<RawSubtitle, "url">> & RawSubtitle => Boolean(s?.url))
    .filter((s) => !/thumb|sprite|storyboard|preview/i.test(`${s.label ?? ""} ${s.srclang ?? ""} ${s.url}`))
    .map((s, i) => ({
      url: anivexaProxyPath(s.url!, headers),
      label: s.label ?? `Subtitles ${i + 1}`,
      lang: s.srclang ?? "en",
      default: Boolean(s.default),
    }));

  return { type, url, subtitles };
}
