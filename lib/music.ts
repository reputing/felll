// Browser side of the music player: calls to our own /api/music (never to the catalog directly).
export interface MusicTrack {
  id: string; title: string; artist: string; album?: string; duration_ms?: number;
  artwork?: { small?: string; large?: string } | null;
}
export interface LyricLine { text: string; start_ms: number; end_ms?: number }
export interface Lyrics { synchronized: boolean; plain_text?: string | null; lines?: LyricLine[] | null }

const MESSAGES: Record<string, string> = {
  missing_query: "type something to search for",
  track_not_found: "that track isn't in the catalog any more",
  audio_unavailable: "the music service is having a moment, try again shortly",
};
export const musicMessage = (code?: string) => (code && MESSAGES[code]) || "the music service didn't answer";

async function get<T>(params: Record<string, string>): Promise<{ data?: T; error?: string }> {
  try {
    const r = await fetch(`/api/music?${new URLSearchParams(params)}`);
    const j = (await r.json().catch(() => ({}))) as { data?: T; error?: { code?: string } | string };
    if (!r.ok) return { error: r.status === 401 ? "sign in again to use the player" : musicMessage(typeof j.error === "object" ? j.error?.code : undefined) };
    return { data: j.data };
  } catch { return { error: "couldn't reach the music service" }; }
}

export const searchMusic = (q: string) => get<{ items: MusicTrack[] }>({ op: "search", q, limit: "12" });
export const musicLyrics = (id: string) => get<Lyrics>({ op: "lyrics", id });
/** a stable URL that redirects to a fresh signed audio link every time it is fetched */
export const streamUrl = (id: string) => `/api/music?op=stream&id=${encodeURIComponent(id)}`;
/** the artwork on the catalog's host only; anything else is dropped */
export const safeArt = (u?: string | null) => { try { const x = new URL(u || ""); return x.protocol === "https:" && x.hostname === "evi.wtf" ? x.href : ""; } catch { return ""; } };

/** the lyric line showing at `ms`, or -1 */
export function activeLine(lines: LyricLine[], ms: number): number {
  let at = -1;
  for (let i = 0; i < lines.length; i++) { if (lines[i].start_ms <= ms) at = i; else break; }
  return at;
}
export const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
