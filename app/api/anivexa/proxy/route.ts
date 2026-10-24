import { anivexaProxyPath } from "@/lib/anivexa";
import { currentUser } from "@/lib/auth";
import { background } from "@/lib/db";

// Streams an upstream HLS playlist/segment through our own origin, applying the
// headers (Referer, etc.) providers require. m3u8 playlists are rewritten so
// their segments/keys/sub-playlists also go through this proxy. Without it the
// browser can't set Referer and most providers reject the request.

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const PASS_THROUGH_HEADERS = ["content-type", "content-length", "accept-ranges", "content-range"];

// Some stream providers bake a watermark (e.g. "PiP") into every subtitle cue.
// Strip it so it doesn't show on screen. Add to the list if one uses another tag.
const SUB_WATERMARKS = ["PiP"];
function cleanSubtitle(text: string): string {
  let out = text;
  for (const w of SUB_WATERMARKS) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out
      .replace(new RegExp(`([A-Za-z])${esc}\\b`, "g"), "$1") // concatenated: I'llPiP -> I'll
      .replace(new RegExp(`\\b${esc}\\b`, "g"), "");          // standalone
  }
  return out.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/gm, "");
}

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
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
  // Members only: the player is same-origin so the session cookie rides along,
  // but this keeps the proxy from being used as an open relay by anyone.
  if (!(await currentUser())) return new Response("Sign in first", { status: 401 });

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
  if (isBlockedHost(targetUrl.hostname)) return new Response("Blocked host", { status: 400 });

  let headers: Record<string, string> = {};
  try {
    const parsed = JSON.parse(searchParams.get("h") ?? "{}");
    // Only string values; drop hop-by-hop / identity headers a caller shouldn't set.
    const banned = new Set(["host", "cookie", "connection", "content-length", "transfer-encoding"]);
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string" && !banned.has(k.toLowerCase())) headers[k] = v;
      }
    }
  } catch {
    headers = {};
  }

  const upstreamHeaders: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    ...headers,
  };
  const range = req.headers.get("range");
  if (range) upstreamHeaders.range = range;

  // Edge-cache full (non-range) segment GETs, so repeat viewers and seeks don't
  // re-pull every .ts through the Worker. Playlists (no-store) are never cached.
  const edge = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const cacheKey = new Request(req.url, { method: "GET" });
  if (edge && !range) {
    try { const hit = await edge.match(cacheKey); if (hit) return hit; } catch { /* ignore */ }
  }
  const cachePut = (resp: Response) => {
    if (edge && !range && resp.status === 200) {
      try { background(edge.put(cacheKey, resp.clone())); } catch { /* ignore */ }
    }
  };

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

  if (/mpegurl|vnd\.apple|x-mpegurl/i.test(contentType) || /\.m3u8(\?|$)/i.test(path)) {
    return makePlaylist(await upstream.text());
  }

  // Subtitles: strip provider watermarks (e.g. "PiP") baked into the cues.
  if (/\.(vtt|srt)(\?|$)/i.test(path) || /text\/vtt|x-subrip|subrip|\bsrt\b/i.test(contentType)) {
    const resp = new Response(cleanSubtitle(await upstream.text()), {
      headers: {
        "content-type": contentType || "text/vtt",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=3600",
      },
    });
    cachePut(resp);
    return resp;
  }

  const responseHeaders = new Headers();
  for (const key of PASS_THROUGH_HEADERS) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  responseHeaders.set("access-control-allow-origin", "*");
  responseHeaders.set("cache-control", "public, max-age=3600");

  // Some providers serve m3u8 with a bogus content-type (e.g. image/jpeg) and no
  // .m3u8 extension. If it isn't an obvious media segment, sniff for #EXTM3U.
  const clearlyBinary =
    /\.(ts|m4s|mp4|m4v|aac|mp3|ogg|opus|flac|key|vtt|srt|ass|webp|jpg|jpeg|png|gif|woff2?)(\?|$)/i.test(path) ||
    contentLength > 2_000_000;

  if (!clearlyBinary) {
    const buf = await upstream.arrayBuffer();
    const head = new TextDecoder().decode(buf.slice(0, 16));
    if (/#EXTM3U/.test(head)) return makePlaylist(new TextDecoder().decode(buf));
    const resp = new Response(buf, { status: upstream.status, headers: responseHeaders });
    cachePut(resp);
    return resp;
  }

  const resp = new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  cachePut(resp);
  return resp;
}

function rewritePlaylist(text: string, baseUrl: URL, headers: Record<string, string>, origin: string): string {
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
      if (trimmed.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${wrap(uri)}"`);
      return wrap(trimmed);
    })
    .join("\n");
}
