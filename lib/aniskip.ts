// AniSkip: community-maintained opening/ending timestamps, keyed by MyAnimeList
// id + episode number — the same ids this site uses everywhere. This gives
// automatic, accurate OP/ED skip with nothing marked by hand. The API is public
// and CORS-enabled, so the browser calls it directly (and can pass the real
// episode length for a tighter match).
//
//   GET https://api.aniskip.com/v2/skip-times/{malId}/{episode}
//         ?types=op&types=ed&episodeLength={seconds}
//   -> { found, results: [{ interval: { startTime, endTime }, skipType }] }

export interface SkipSpan { start: number; end: number }

interface AniResult { interval?: { startTime?: number; endTime?: number }; skipType?: string }

export async function fetchAniSkip(
  malId: number,
  episode: number,
  episodeLength = 0,
): Promise<{ intro: SkipSpan | null; outro: SkipSpan | null }> {
  const empty = { intro: null, outro: null };
  if (!Number.isInteger(malId) || !Number.isInteger(episode) || episode < 1) return empty;
  const len = Number.isFinite(episodeLength) ? Math.max(0, Math.round(episodeLength)) : 0;
  const url =
    `https://api.aniskip.com/v2/skip-times/${malId}/${episode}` +
    `?types=op&types=ed&types=mixed-op&types=mixed-ed&episodeLength=${len}`;

  let data: { found?: boolean; results?: AniResult[] } | null = null;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return empty;
    data = (await res.json()) as { found?: boolean; results?: AniResult[] };
  } catch {
    return empty;
  }
  if (!data?.found || !Array.isArray(data.results)) return empty;

  const span = (types: string[]): SkipSpan | null => {
    const r = data!.results!.find((x) => types.includes(x.skipType ?? ""));
    const s = r?.interval?.startTime;
    const e = r?.interval?.endTime;
    if (s == null || e == null || !(e > s)) return null;
    return { start: Math.max(0, Math.round(s)), end: Math.round(e) };
  };
  return { intro: span(["op", "mixed-op"]), outro: span(["ed", "mixed-ed"]) };
}
