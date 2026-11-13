import { cached } from "./movie-cache";

// Optional extra anime servers from Reanime's public resolver: GET https://reanime.cz/api/flix/{anilistId}/{episode} lists
// Flixcloud player links for an episode. What was checked (13 Nov 2026, from a datacenter test machine; see docs/streaming-providers.md):
//   HTTP verified    the resolver answers JSON in the documented shape (success, servers[{ serverName, dataLink, dataType, hardsub }]).
//   Plays sometimes  with the player options the supplied prototype uses (autoPlay, skI, skO) the video decoded at 1920x1080 with the
//                    clock advancing under the sandbox below, 3 times in about 10 tries. Without those options it never played in 5
//                    tries. The player's stream request (/api/m3u8/...) also answers 410 Gone, most often on repeated requests from
//                    one connection; that looks like throttling, so a viewer's own connection may do better. Not guaranteed.
//   Not ad-free      the player loads third-party scripts inside its frame (an affiliate/ad tag, an identity tracker, an ad-network
//                    ping). No popup, redirect or visible ad was seen in the samples (7 clicks, 0 blocked attempts), but that cannot
//                    prove there are none. The sandbox blocks popups and redirects of our page; it cannot stop scripts inside the frame.
// So this is offered as a clearly labelled, opt-in server and never as a default or an automatic fallback.
//
// Safety: the upstream address is fixed, inputs are numbers only, the response is size-capped, and the embed URL is REBUILT from a
// validated file id and player version. Nothing the upstream sends is ever used as a URL, so it cannot point us at another host.

const UPSTREAM = "https://reanime.cz/api/flix";
const MAX_BYTES = 64 * 1024;
const FILE_ID = /^[a-z0-9]{6,32}$/;
const VARIANTS: Record<string, string> = { "1": "HD-1", "2": "HD-2", "3": "H-SUB" };
// The player options the supplied prototype was tested with. Fixed values, never taken from upstream: autoplay once a viewer has chosen
// the server, and the player's own skip-intro/outro left off.
const PLAYER_OPTIONS = "autoPlay=true&skI=false&skO=false";

export interface FlixServer {
  /** the name shown to viewers */
  name: string;
  /** "sub", "dub" or "hardsub": the label the resolver gave; the player's own audio menu decides what actually plays */
  language: string;
  hardsub: boolean;
  /** rebuilt by us: https://flixcloud.cc/e/{id}?v={1|2|3} plus the fixed player options below */
  embedUrl: string;
}
/** What is kept in the cache: only validated pieces. The URL is built when it is served, so changing how it is built never leaves a stale one behind. */
interface Piece { id: string; v: string; language: string; hardsub: boolean }
const embedUrl = (p: Piece) => `https://flixcloud.cc/e/${p.id}?v=${p.v}&${PLAYER_OPTIONS}`;

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
export function parsePieces(body: unknown): Piece[] {
  const rows = (body as { servers?: unknown })?.servers;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: Piece[] = [];
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
    out.push({ id, v, language, hardsub });
  }
  return out;
}

/** The servers for the viewer: the validated pieces with their names and rebuilt URLs. Exported for tests. */
export function parseServers(body: unknown): FlixServer[] {
  return parsePieces(body).map((p) => ({ name: VARIANTS[p.v], language: p.language, hardsub: p.hardsub, embedUrl: embedUrl(p) }));
}

/** The Flixcloud servers for one episode, or [] (never throws: a failing upstream just means no extra servers). */
export async function flixServers(anilistId: unknown, episode: unknown): Promise<FlixServer[]> {
  const a = int(anilistId, 100_000_000), e = int(episode, 5000);
  if (!a || !e) return [];
  const hit = await cached<{ s: Piece[] }>(`flix2:${a}:${e}`, async () => {
    try {
      const r = await fetch(`${UPSTREAM}/${a}/${e}`, { signal: AbortSignal.timeout(6000), headers: { accept: "application/json" }, redirect: "error" });
      if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
      const text = await r.text();
      if (text.length > MAX_BYTES) return null;
      return { s: parsePieces(JSON.parse(text)) };
    } catch { return null; }
  }, 10 * 60);
  return (hit?.s ?? []).map((p) => ({ name: VARIANTS[p.v], language: p.language, hardsub: p.hardsub, embedUrl: embedUrl(p) }));
}
