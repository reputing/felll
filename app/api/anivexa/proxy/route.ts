import { anivexaEnabled, anivexaProxyPath } from "@/lib/anivexa";

// Streams an upstream HLS playlist/segment through our own origin, applying the
// headers (Referer, Authorization, …) that providers require. m3u8 playlists
// are rewritten so their segments, keys and sub-playlists are fetched back
// through this proxy with the same headers. Without this, the browser can't set
// Referer and most providers reject the request.

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const PASS_THROUGH_HEADERS = ["content-type", "content-length", "accept-ranges", "content-range"];

/** Reject internal/loopback/link-local hosts so the proxy can't be used for SSRF. */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) {
    return true;
  }
  if (h === "[::1]" || h === "::1") return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

export async function GET(req: Request) {
  if (!anivexaEnabled()) return new Response("Not configured", { status: 503 });

  const { searchParams, origin } = new URL(req.url);
  const target = searchParams.get("u");
  if (!target) return new Response("Missing url", { status: 400 });

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return new Response("Unsupported scheme", { status: 400 });
  }
  if (isBlockedHost(targetUrl.hostname)) {
    return new Response("Blocked host", { status: 400 });
  }

  let headers: Record<string, string> = {};
  try {
    headers = JSON.parse(searchParams.get("h") ?? "{}");
  } catch {
    headers = {};
  }

  const upstreamHeaders: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    ...headers,
  };
  // Note: we deliberately do NOT synthesize an Origin header — several stream
  // hosts return 403 when an unexpected Origin is present. We send only the
  // Referer the provider gave us (plus anything in its headers).
  // Forward Range so seeking works on segment/MP4 requests.
  const range = req.headers.get("range");
  if (range) upstreamHeaders.range = range;

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, { headers: upstreamHeaders, redirect: "follow" });
  } catch {
    return new Response("Upstream fetch failed", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream error", { status: upstream.status || 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const path = targetUrl.pathname.toLowerCase();
  const contentLength = Number(upstream.headers.get("content-length") || "0");

  const makePlaylist = (text: string) =>
    new Response(rewritePlaylist(text, targetUrl, headers, origin), {
      headers: {
        "content-type": "application/vnd.apple.mpegurl",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
    });

  // Obvious playlist by content-type or extension.
  if (/mpegurl|vnd\.apple|x-mpegurl/i.test(contentType) || /\.m3u8(\?|$)/i.test(path)) {
    return makePlaylist(await upstream.text());
  }

  const responseHeaders = new Headers();
  for (const key of PASS_THROUGH_HEADERS) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  responseHeaders.set("access-control-allow-origin", "*");
  responseHeaders.set("cache-control", "public, max-age=3600");

  // Some providers serve m3u8 disguised with a wrong content-type (e.g.
  // image/jpeg) and no .m3u8 extension. If this isn't an obvious media segment,
  // sniff the first bytes for the #EXTM3U marker and rewrite it as a playlist.
  const clearlyBinary =
    /\.(ts|m4s|mp4|m4v|aac|mp3|ogg|opus|flac|key|vtt|srt|ass|webp|jpg|jpeg|png|gif|woff2?)(\?|$)/i.test(path) ||
    contentLength > 2_000_000;

  if (!clearlyBinary) {
    const buf = await upstream.arrayBuffer();
    const head = new TextDecoder().decode(buf.slice(0, 16));
    if (/#EXTM3U/.test(head)) {
      return makePlaylist(new TextDecoder().decode(buf));
    }
    // Not a playlist — return the raw bytes untouched (don't corrupt binary).
    return new Response(buf, { status: upstream.status, headers: responseHeaders });
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

/** Rewrite every URI in an m3u8 to point back through this proxy. */
function rewritePlaylist(
  text: string,
  baseUrl: URL,
  headers: Record<string, string>,
  origin: string,
): string {
  const wrap = (uri: string): string => {
    let absolute: string;
    try {
      absolute = new URL(uri, baseUrl).toString();
    } catch {
      return uri;
    }
    return origin + anivexaProxyPath(absolute, headers);
  };

  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        // Tags that embed a URI="..." (keys, media renditions, maps, i-frames).
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${wrap(uri)}"`);
      }
      return wrap(trimmed);
    })
    .join("\n");
}
