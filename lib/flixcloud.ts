import { cached } from "./movie-cache";

// Optional extra anime servers from Reanime's public resolver: GET https://reanime.cz/api/flix/{anilistId}/{episode} lists
// Flixcloud player links for an episode. What was checked on 13 Nov 2026 (see docs/streaming-providers.md):
//   HTTP verified   the resolver answers JSON in the documented shape (success, servers[{ serverName, dataLink, dataType, hardsub }]).
//   NOT verified    that the video plays: from our datacenter test machine the player's stream request answered 410 Gone ("Failed to
//                   decrypt video URL"), so playback is unconfirmed here. It is reported to play from other connections.
//   NOT ad-free     inside the frame the player loads third-party scripts (an affiliate/ad tag, an identity tracker). The sandbox
//                   blocks popups and redirects; it cannot remove scripts that run inside the frame.
// So this is offered as a clearly labelled, opt-in server and never as a default or a fallback.
//
// Safety: the upstream address is fixed, inputs are numbers only, the response is size-capped, and the embed URL is REBUILT from a
// validated file id and player version. Nothing the upstream sends is ever used as a URL, so it cannot point us at another host.

const UPSTREAM = "https://reanime.cz/api/flix";
const MAX_BYTES = 64 * 1024;
const FILE_ID = /^[a-z0-9]{6,32}$/;
const VARIANTS: Record<string, string> = { "1": "HD-1", "2": "HD-2", "3": "H-SUB" };

export interface FlixServer {
  /** the name shown to viewers */
  name: string;
  /** "sub", "dub" or "hardsub": the label the resolver gave; the player's own audio menu decides what actually plays */
  language: string;
  hardsub: boolean;
  /** rebuilt by us: https://flixcloud.cc/e/{id}?v={1|2|3} */
  embedUrl: string;
}

/** The sandbox and permissions every embedded player gets. Same policy as the movie player's Zeus frame: scripts and same-origin
 *  only, so popups, top navigation, forms, downloads and modals are blocked by the browser. */
export const EMBED_POLICY = {
  sandbox: "allow-scripts allow-same-origin",
  allow: "autoplay; fullscreen; picture-in-picture",
  referrerPolicy: "strict-origin-when-cross-origin",
  origin: "https://flixcloud.cc",
} as const;

const int = (v: unknown, max: number): number | null => {
  const n = typeof v === "string" ? (/^\d{1,9}$/.test(v) ? Number(v) : NaN) : typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
};

/** Pull the servers out of the resolver's JSON, keeping only what passes validation. Exported for tests. */
export function parseServers(body: unknown): FlixServer[] {
  const rows = (body as { servers?: unknown })?.servers;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: FlixServer[] = [];
  for (const r of rows.slice(0, 40)) {
    const link = typeof (r as { dataLink?: unknown })?.dataLink === "string" ? (r as { dataLink: string }).dataLink : "";
    let u: URL;
    try { u = new URL(link); } catch { continue; }
    const id = /^\/e\/([a-z0-9]+)\/?$/.exec(u.pathname)?.[1];
    const v = u.searchParams.get("v") ?? "";
    // exactly https://flixcloud.cc/e/{id}?v=N, nothing else (no credentials, no port, no other host)
    if (u.protocol !== "https:" || u.hostname !== "flixcloud.cc" || u.port || u.username || u.password || !id || !FILE_ID.test(id) || !VARIANTS[v]) continue;
    const type = String((r as { dataType?: unknown }).dataType ?? "").toLowerCase();
    const hardsub = (r as { hardsub?: unknown }).hardsub === true;
    const language = hardsub ? "hardsub" : type === "dub" ? "dub" : "sub";
    const key = `${id}:${v}:${language}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: VARIANTS[v], language, hardsub, embedUrl: `https://flixcloud.cc/e/${id}?v=${v}` });
  }
  return out;
}

/** The Flixcloud servers for one episode, or [] (never throws: a failing upstream just means no extra servers). */
export async function flixServers(anilistId: unknown, episode: unknown): Promise<FlixServer[]> {
  const a = int(anilistId, 100_000_000), e = int(episode, 5000);
  if (!a || !e) return [];
  const hit = await cached<{ s: FlixServer[] }>(`flix:${a}:${e}`, async () => {
    try {
      const r = await fetch(`${UPSTREAM}/${a}/${e}`, { signal: AbortSignal.timeout(6000), headers: { accept: "application/json" }, redirect: "error" });
      if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
      const text = await r.text();
      if (text.length > MAX_BYTES) return null;
      return { s: parseServers(JSON.parse(text)) };
    } catch { return null; }
  }, 10 * 60);
  return hit?.s ?? [];
}
