import { cinemaPing } from "./cinema";

// One answer per upstream the movies section depends on, for /api/health: is it reachable and how fast. Each check is a
// small real request with its own timeout, so one slow service cannot hold the report up.
export interface Probe { ok: boolean; ms: number; status?: number }

async function probe(url: string, init: RequestInit = {}, timeout = 7000): Promise<Probe> {
  const t = Date.now();
  try {
    const r = await fetch(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(timeout), headers: { "user-agent": "cupcake.gg/1.0 (+https://cupcake.gg)", ...(init.headers || {}) } });
    await r.body?.cancel().catch(() => {});
    return { ok: r.ok, ms: Date.now() - t, status: r.status };
  } catch {
    return { ok: false, ms: Date.now() - t };
  }
}

export async function moviesUpstreams() {
  const [catalog, zeus, subtitles, imdb, wikipedia, wikidata] = await Promise.all([
    cinemaPing().catch(() => ({ ok: false, ms: 0 })),
    // the player page for a long-lived film (Fight Club); 200 means CineSrc is up
    probe("https://cinesrc.st/embed/movie/550"),
    probe("https://opensubtitles-v3.strem.io/subtitles/movie/tt0111161.json"),
    probe("https://v3.sg.media-imdb.com/suggestion/b/brad%20pitt.json"),
    probe("https://en.wikipedia.org/api/rest_v1/page/summary/Brad_Pitt"),
    probe(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent("SELECT ?x WHERE { wd:Q1 wdt:P31 ?x } LIMIT 1")}`, {}, 9000),
  ]);
  return { catalog, zeus, subtitles, people: { imdb, wikipedia, wikidata } };
}
