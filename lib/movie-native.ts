// Native (ad-free) movie/TV sources: the movie-resolver-server container asks the
// providers' JSON APIs for an HLS url and hands back same-origin relay urls, so
// our own <video> plays it and no third-party player script (or its ads) ever
// runs in the page. Set MOVIE_RESOLVER_URL (var) + MOVIE_RESOLVER_KEY (secret);
// unset and every call soft-fails to [], so the embeds just carry on alone.
import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface NativeSource { label: string; provider: string; format: "hls" | "mp4" | "dash"; url: string }

async function conf(): Promise<{ base: string; key: string } | null> {
  let e: Record<string, string | undefined> = {};
  try { e = (await getCloudflareContext({ async: true })).env as unknown as Record<string, string | undefined>; } catch { /* not in a request context */ }
  const base = e.MOVIE_RESOLVER_URL || process.env.MOVIE_RESOLVER_URL;
  const key = e.MOVIE_RESOLVER_KEY || process.env.MOVIE_RESOLVER_KEY;
  return base && key ? { base: base.replace(/\/+$/, ""), key } : null;
}

export async function nativeEnabled(): Promise<boolean> { return (await conf()) !== null; }

export async function nativeSources(type: "movie" | "tv", id: number, se?: number, ep?: number): Promise<NativeSource[]> {
  const c = await conf();
  if (!c || !Number.isInteger(id) || id < 1) return [];
  const qs = new URLSearchParams({ type, id: String(id) });
  if (type === "tv") { qs.set("s", String(se || 1)); qs.set("e", String(ep || 1)); }
  try {
    const r = await fetch(`${c.base}/resolve?${qs}`, { headers: { "x-resolver-key": c.key }, signal: AbortSignal.timeout(25_000) });
    if (!r.ok) return [];
    const d = (await r.json()) as { sources?: NativeSource[] };
    return (d.sources ?? []).filter((s) => typeof s.url === "string" && s.url.startsWith("/api/movie/relay?t="));
  } catch { return []; }
}

/** The container's /media url for a relay token; null when not configured. */
export async function nativeMediaUrl(token: string, n?: string): Promise<{ url: string; key: string } | null> {
  const c = await conf();
  return c ? { url: `${c.base}/media?t=${encodeURIComponent(token)}${n ? `&n=${encodeURIComponent(n)}` : ""}`, key: c.key } : null;
}
