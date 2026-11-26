import { memberOr401 } from "@/lib/auth";
import { cached } from "@/lib/movie-cache";

// Where the intro ends and the credits start, for a film or one episode. Two
// community databases, both keyless, so there is nothing to mark by hand:
//   IntroDB     (introdb.app)     keyed by IMDb id + season + episode, series only
//   TheIntroDB  (theintrodb.org)  keyed by TMDB id, films and series
// IntroDB wins; TheIntroDB fills whatever it did not have.
//   GET ?imdb=tt0903747&tmdb=1396&se=1&ep=1
//   -> { intro: {start,end}|null, outro: {start,end|null}|null }   (seconds; outro.end null = to the end)
const IMDB = /^tt\d{5,10}$/;
interface Marks { intro: { start: number; end: number } | null; outro: { start: number; end: number | null } | null }

const sec = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { accept: "application/json" } });
    return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
  } catch { return null; }
}

// An intro is a handful of minutes at most. Anything longer is somebody's typo
// and would make "auto skip" eat the episode.
const intro = (s: number | null, e: number | null) => (s != null && e != null && e > s && e - s <= 600 ? { start: Math.round(s), end: Math.round(e) } : null);

async function lookup(imdb: string, tmdb: number, se: number, ep: number): Promise<Marks> {
  const out: Marks = { intro: null, outro: null };
  const tv = se > 0 && ep > 0;

  if (tv) {
    const d = await getJson(`https://api.introdb.app/segments?imdb_id=${imdb}&season=${se}&episode=${ep}`);
    const i = d?.intro as { start_sec?: number; end_sec?: number } | null | undefined;
    const o = d?.outro as { start_sec?: number; end_sec?: number } | null | undefined;
    if (i) out.intro = intro(sec(i.start_sec), sec(i.end_sec));
    if (o && sec(o.start_sec) != null) out.outro = { start: Math.round(sec(o.start_sec)!), end: sec(o.end_sec) != null ? Math.round(sec(o.end_sec)!) : null };
  }

  if ((!out.intro || !out.outro) && tmdb > 0) {
    const q = tv ? `tmdb_id=${tmdb}&season=${se}&episode=${ep}` : `tmdb_id=${tmdb}`;
    const d = await getJson(`https://api.theintrodb.org/v2/media?${q}`);
    const i = (d?.intro as { start_ms?: number | null; end_ms?: number | null }[] | undefined)?.[0];
    const c = (d?.credits as { start_ms?: number | null; end_ms?: number | null }[] | undefined)?.[0];
    if (!out.intro && i && i.end_ms != null) out.intro = intro(i.start_ms == null ? 0 : i.start_ms / 1000, i.end_ms / 1000);
    if (!out.outro && c && c.start_ms != null && c.start_ms >= 0) out.outro = { start: Math.round(c.start_ms / 1000), end: c.end_ms != null ? Math.round(c.end_ms / 1000) : null };
  }
  return out;
}

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const u = new URL(req.url).searchParams;
  const imdb = u.get("imdb") ?? "";
  if (!IMDB.test(imdb)) return Response.json({ intro: null, outro: null }, { status: 400 });
  const tmdb = Math.max(0, Math.floor(Number(u.get("tmdb")) || 0));
  const se = Math.max(0, Math.floor(Number(u.get("se")) || 0)), ep = Math.max(0, Math.floor(Number(u.get("ep")) || 0));
  // An empty answer is cached too (the cache skips a null, so wrap it): most
  // films have nothing, and asking two APIs every play to learn that is waste.
  const key = `skip:${imdb}:${se}:${ep}`;
  const hit = await cached<{ m: Marks }>(key, async () => ({ m: await lookup(imdb, tmdb, se, ep) }), 12 * 3600);
  return Response.json(hit?.m ?? { intro: null, outro: null }, { headers: { "cache-control": "private, max-age=600" } });
}
