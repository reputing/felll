import { memberOr401 } from "@/lib/auth";
import { cached } from "@/lib/movie-cache";
import { langName } from "@/lib/subtitle-langs";

// Subtitle tracks for a film or one episode, from OpenSubtitles through Stremio's public subtitle addon (no key). Each
// track's file goes through /api/movie/subtitle (the addon's host does not allow browsers to read it directly).
//   GET ?imdb=tt0111161                 a film
//   GET ?imdb=tt0903747&se=2&ep=3       an episode
// -> { tracks: [{ id, language, label, url, is_default }] }, English first, then by how many there are, at most 4 a language.
const IMDB = /^tt\d{5,10}$/;
const ADDON = "https://opensubtitles-v3.strem.io/subtitles";

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const u = new URL(req.url).searchParams;
  const imdb = u.get("imdb") ?? "";
  if (!IMDB.test(imdb)) return Response.json({ tracks: [] }, { status: 400 });
  const se = Math.max(0, Number(u.get("se")) || 0), ep = Math.max(0, Number(u.get("ep")) || 0);
  const path = se && ep ? `series/${imdb}:${se}:${ep}` : `movie/${imdb}`;
  const raw = await cached<{ subtitles: { id: string; url: string; lang: string }[] }>(`subs:${path}`, async () => {
    try {
      const r = await fetch(`${ADDON}/${path}.json`, { signal: AbortSignal.timeout(9000), headers: { accept: "application/json" } });
      if (!r.ok) return null;
      const d = (await r.json()) as { subtitles?: { id: string; url: string; lang: string }[] };
      return Array.isArray(d.subtitles) && d.subtitles.length ? { subtitles: d.subtitles.slice(0, 400) } : null;
    } catch { return null; }
  }, 6 * 3600);

  const by = new Map<string, { id: string; url: string }[]>();
  for (const s of raw?.subtitles ?? []) {
    if (!s?.url || !/^https:\/\/subs\d*\.strem\.io\//.test(s.url)) continue;
    by.set(s.lang, [...(by.get(s.lang) ?? []), { id: String(s.id), url: s.url }]);
  }
  const langs = [...by.keys()].sort((a, b) => (a === "eng" ? -1 : b === "eng" ? 1 : (by.get(b)!.length - by.get(a)!.length) || a.localeCompare(b)));
  const tracks = langs.flatMap((l) => by.get(l)!.slice(0, 4).map((s, i, all) => ({
    id: `${l}-${s.id}`, language: l, label: all.length > 1 ? `${langName(l)} ${i + 1}` : langName(l), url: `/api/movie/subtitle?u=${encodeURIComponent(s.url)}`, is_default: 0,
  })));
  return Response.json({ tracks }, { headers: { "cache-control": "private, max-age=600" } });
}
