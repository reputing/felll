// Client for a self-hosted 8Stream API (github.com/himanshu8443/8StreamApi):
// resolves a playable HLS stream for a movie from its IMDB id. Point
// STREAM8_API_URL at the deployed instance; leave it unset and every call
// soft-fails to [], so the movie player just uses the embed servers.
//
// Movies only — the API exposes no reliable per-episode lookup for series, so
// TV episodes fall back to the embed servers.
//
//   GET  /api/v1/mediaInfo?id=<imdb>   -> { data: { playlist:[{title,id,file}], key } }
//   POST /api/v1/getStream {file,key}  -> { data: { link } }   (an .m3u8)
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { anivexaProxyPath } from "./anivexa";

async function base(): Promise<string | null> {
  let url: string | undefined;
  try {
    const env = (await getCloudflareContext({ async: true })).env as unknown as { STREAM8_API_URL?: string };
    url = env?.STREAM8_API_URL;
  } catch {
    // not in a request context
  }
  if (!url) url = process.env.STREAM8_API_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

export async function stream8Enabled(): Promise<boolean> {
  return (await base()) !== null;
}

/** Health probe: is 8Stream configured and reachable? (for /api/health) */
export async function stream8Ping(): Promise<{ configured: boolean; ok: boolean; ms: number }> {
  const b = await base();
  if (!b) return { configured: false, ok: false, ms: 0 };
  const t = Date.now();
  try {
    const res = await fetch(b, { signal: AbortSignal.timeout(6000) });
    return { configured: true, ok: res.status < 500, ms: Date.now() - t };
  } catch {
    return { configured: true, ok: false, ms: Date.now() - t };
  }
}

export interface Stream8Source {
  label: string;
  url: string;
}

interface MediaInfo {
  playlist?: { title?: string; id?: string; file?: string }[];
  key?: string;
}

// Resolve the playable HLS link(s) for a movie by IMDB id — one per language the
// API offers (English first), each proxied through our own origin so a CORS or
// Referer check on the stream CDN never blocks playback. Nothing is cached: the
// file/key tokens are short-lived.
export async function stream8Movie(imdbId: string | null | undefined): Promise<Stream8Source[]> {
  const b = await base();
  if (!b || !imdbId || !/^tt\d+$/.test(imdbId)) return [];

  let info: MediaInfo | null = null;
  try {
    const res = await fetch(`${b}/api/v1/mediaInfo?id=${encodeURIComponent(imdbId)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    info = ((await res.json()) as { data?: MediaInfo })?.data ?? null;
  } catch {
    return [];
  }

  const key = info?.key;
  const playlist = (info?.playlist ?? []).filter((p) => p?.file);
  if (!key || !playlist.length) return [];

  // English first, then the rest; cap so we don't fan out to a dozen POSTs.
  playlist.sort((a, c) => Number(/eng/i.test(c.title ?? "")) - Number(/eng/i.test(a.title ?? "")));
  const chosen = playlist.slice(0, 6);

  const resolved = await Promise.all(
    chosen.map(async (p): Promise<Stream8Source | null> => {
      try {
        const res = await fetch(`${b}/api/v1/getStream`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ file: p.file, key }),
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) return null;
        const link = ((await res.json()) as { data?: { link?: string } })?.data?.link;
        if (!link || !/^https?:\/\//.test(link)) return null;
        return { label: p.title?.trim() || "8Stream", url: anivexaProxyPath(link) };
      } catch {
        return null;
      }
    }),
  );
  return resolved.filter((s): s is Stream8Source => s != null);
}
