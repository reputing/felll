// Client for the Anivexa aggregator API (https://github.com/walterwhite-69/Anivexa-API).
//
// Anivexa resolves episode lists and stream sources across 12 providers from a
// single AniList ID. We call it server-side only, so its base URL stays off the
// browser and we can wrap provider streams through our own HLS proxy (many
// providers gate playback behind a Referer header that a browser can't set).
//
// Enabled by setting ANIVEXA_API_URL (e.g. http://localhost:4000 in dev, or the
// deployed Anivexa URL in production). When unset, every helper no-ops and the
// site falls back to self-hosted sources only.

/** Provider slugs understood by Anivexa, with their display names. */
export const ANIVEXA_PROVIDERS: { slug: string; name: string }[] = [
  { slug: "mkissa", name: "MKissa" },
  { slug: "reanime", name: "Reanime" },
  { slug: "anikoto", name: "Anikoto" },
  { slug: "animegg", name: "AnimeGG" },
  { slug: "animenosub", name: "AnimeNoSub" },
  { slug: "anizone", name: "AniZone" },
  { slug: "aniwaves", name: "AniWaves" },
  { slug: "senshi", name: "Senshi" },
  { slug: "kaa", name: "KickAssAnime" },
  { slug: "animedunya", name: "AnimeDunya" },
  { slug: "animeonsen", name: "AnimeOnsen" },
  { slug: "anipm", name: "Ani.pm" },
];

const PROVIDER_SLUGS = new Set(ANIVEXA_PROVIDERS.map((p) => p.slug));
const PROVIDER_NAME = new Map(ANIVEXA_PROVIDERS.map((p) => [p.slug, p.name]));

/** Keys of the /episodes response that are not providers. */
const META_KEYS = new Set(["page", "type", "mappings", "_unknownProviders"]);

export function isAnivexaProvider(slug: string): boolean {
  return PROVIDER_SLUGS.has(slug);
}

function base(): string | null {
  const url = process.env.ANIVEXA_API_URL?.trim().replace(/\/+$/, "");
  return url ? url : null;
}

export function anivexaEnabled(): boolean {
  return base() !== null;
}

async function getJson(path: string): Promise<unknown | null> {
  const b = base();
  if (!b) return null;
  try {
    const res = await fetch(`${b}${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// --- Episode catalog -------------------------------------------------------

export interface AnivexaProviderSummary {
  slug: string;
  name: string;
  sub: number[];
  dub: number[];
}

export interface AnivexaCatalog {
  providers: AnivexaProviderSummary[];
  episodes: {
    number: number;
    title: string | null;
    thumbnail_url: string | null;
    synopsis: string | null;
    filler: boolean;
    sub: boolean;
    dub: boolean;
  }[];
}

interface RawEpisodeItem {
  number?: number;
  title?: string | null;
  filler?: boolean;
  image?: string | null;
  description?: string | null;
}

/** Fetch and normalize the per-provider episode lists for an AniList ID. */
export async function fetchAnivexaCatalog(anilistId: number): Promise<AnivexaCatalog | null> {
  const data = await getJson(`/episodes/${anilistId}`);
  if (!data || typeof data !== "object") return null;

  const providers: AnivexaProviderSummary[] = [];
  const merged = new Map<number, AnivexaCatalog["episodes"][number]>();

  for (const [slug, value] of Object.entries(data as Record<string, unknown>)) {
    if (META_KEYS.has(slug) || !isAnivexaProvider(slug)) continue;
    const provider = value as { episodes?: { sub?: RawEpisodeItem[]; dub?: RawEpisodeItem[] } };
    const episodes = provider?.episodes;
    if (!episodes || typeof episodes !== "object") continue; // error object

    const sub = numbersOf(episodes.sub);
    const dub = numbersOf(episodes.dub);
    if (sub.length === 0 && dub.length === 0) continue;
    providers.push({ slug, name: PROVIDER_NAME.get(slug) ?? slug, sub, dub });

    for (const [list, audio] of [
      [episodes.sub, "sub"],
      [episodes.dub, "dub"],
    ] as const) {
      for (const item of Array.isArray(list) ? list : []) {
        const n = Number(item?.number);
        if (!Number.isFinite(n)) continue;
        const existing = merged.get(n) ?? {
          number: n,
          title: null,
          thumbnail_url: null,
          synopsis: null,
          filler: false,
          sub: false,
          dub: false,
        };
        existing[audio] = true;
        existing.title ??= item.title ?? null;
        existing.thumbnail_url ??= item.image ?? null;
        existing.synopsis ??= item.description ?? null;
        existing.filler ||= Boolean(item.filler);
        merged.set(n, existing);
      }
    }
  }

  if (providers.length === 0) return null;
  const episodes = [...merged.values()].sort((a, b) => a.number - b.number);
  return { providers, episodes };
}

function numbersOf(list: RawEpisodeItem[] | undefined): number[] {
  if (!Array.isArray(list)) return [];
  const nums = list.map((e) => Number(e?.number)).filter((n) => Number.isFinite(n));
  return [...new Set(nums)].sort((a, b) => a - b);
}

// --- Stream resolution -----------------------------------------------------

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
  episode: number;
  audio: string;
  server: string;
  type: "hls" | "dash" | "embed";
  /** Ready-to-play URL: proxied for hls/dash, the raw embed URL otherwise. */
  url: string;
  subtitles: { url: string; label: string; lang: string; default: boolean }[];
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

/**
 * Build the path to our own HLS proxy for one upstream URL. The proxy applies
 * `headers` (Referer etc.) server-side and rewrites m3u8 playlists so segments
 * and keys are fetched through it too. Relative so it resolves same-origin.
 */
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

function timeRange(range: unknown): { start: number; end: number } | null {
  const r = range as { start?: number; end?: number } | undefined;
  const start = Number(r?.start) || 0;
  const end = Number(r?.end) || 0;
  return end > start ? { start, end } : null;
}

/**
 * Fetch stream sources for one provider/episode and normalize them into a
 * single playable stream plus subtitles. `audio` is "sub" or "dub".
 */
export async function resolveAnivexaStream(
  provider: string,
  anilistId: number,
  audio: string,
  episode: number,
): Promise<ResolvedAnivexaStream | null> {
  if (!isAnivexaProvider(provider) || (audio !== "sub" && audio !== "dub")) return null;
  const path = `/watch/${provider}/${anilistId}/${audio}/${provider}-${episode}`;
  const data = (await getJson(path)) as
    | { streams?: RawStream[]; subtitles?: RawSubtitle[]; intro?: unknown; outro?: unknown }
    | null;
  if (!data || !Array.isArray(data.streams)) return null;

  const chosen = selectStream(data.streams);
  if (!chosen?.url) return null;

  const type = (chosen.type ?? "hls") as ResolvedAnivexaStream["type"];
  const headers = streamHeaders(chosen);
  const url =
    type === "embed" ? chosen.url : anivexaProxyPath(chosen.url, headers);

  const rawSubs = chosen.subtitles?.length ? chosen.subtitles : data.subtitles ?? [];
  const subtitles = (rawSubs ?? [])
    .filter((s): s is Required<Pick<RawSubtitle, "url">> & RawSubtitle => Boolean(s?.url))
    // Drop thumbnail / storyboard "subtitle" tracks (scrubber previews) — some
    // providers ship them as VTT, which otherwise render as on-screen captions.
    .filter((s) => !/thumb|sprite|storyboard|preview/i.test(`${s.label ?? ""} ${s.srclang ?? ""} ${s.url}`))
    .map((s, i) => ({
      url: anivexaProxyPath(s.url!, headers),
      label: s.label ?? `Subtitles ${i + 1}`,
      lang: s.srclang ?? "en",
      default: Boolean(s.default),
    }));

  return {
    episode,
    audio,
    server: chosen.server ?? PROVIDER_NAME.get(provider) ?? provider,
    type,
    url,
    subtitles,
    intro: timeRange(data.intro),
    outro: timeRange(data.outro),
  };
}
