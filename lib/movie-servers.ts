// The embed servers a watch page offers, and which of them are alive right now.
//
// These are third-party players that sites publish for embedding: one iframe per server, keyed by the IMDb or TMDB
// id. They come and go (a dozen that worked last year answer "origin unreachable" today), so the list is long on
// purpose and checked at render time: a host that does not answer, or answers 5xx, is dropped from the picker for ten
// minutes and comes back by itself. A 403 still counts as alive, because that is how some of them treat a datacenter
// client that a browser would never be.
//
// The embeds play in the viewer's own browser, so a host that blocks datacenter addresses (which the direct Moviebox
// stream also does) is not a problem for them.
export interface TitleIds { imdb?: string | null; tmdb?: number | null }
export interface MovieEmbed { name: string; url: string }

interface Host {
  name: string;
  /** a url on this host, or null when the host cannot take the ids we have */
  movie: (i: TitleIds) => string | null;
  tv: (i: TitleIds, s: number, e: number) => string | null;
}

const imdbOrTmdb = (i: TitleIds) => (i.imdb ? { k: "imdb", v: i.imdb } : i.tmdb ? { k: "tmdb", v: String(i.tmdb) } : null);

function tmdbPath(base: string, movie = "movie", tv = "tv"): Pick<Host, "movie" | "tv"> {
  return {
    movie: (i) => (i.tmdb ? `${base}/${movie}/${i.tmdb}` : null),
    tv: (i, s, e) => (i.tmdb ? `${base}/${tv}/${i.tmdb}/${s}/${e}` : null),
  };
}

const twoEmbed = (base: string): Pick<Host, "movie" | "tv"> => ({
  movie: (i) => (i.imdb ? `${base}/embed/${i.imdb}` : i.tmdb ? `${base}/embed/${i.tmdb}` : null),
  tv: (i, s, e) => (i.imdb ? `${base}/embedtv/${i.imdb}&s=${s}&e=${e}` : i.tmdb ? `${base}/embedtv/${i.tmdb}&s=${s}&e=${e}` : null),
});

// Every entry here was loaded in a real browser and showed a player for the right title (a film's 2h22m runtime, a
// series episode's own length); the ones that did not were cut. A host that answers 200 and then says "Not found" in its
// own page (vidsrc.pm, vidsrc.net, nontongo) cannot be caught by a liveness check, so it has to be curated by hand.
// Best first: the ones that were seen playing on their own, then the ones that wait for a click. 2Embed's TV pages answer "Forbidden" inside the player, so it is offered for films only.
const HOSTS: Host[] = [
  {
    name: "VidSrc.to",
    movie: (i) => { const p = imdbOrTmdb(i); return p ? `https://vidsrc.to/embed/movie/${p.v}` : null; },
    tv: (i, s, e) => { const p = imdbOrTmdb(i); return p ? `https://vidsrc.to/embed/tv/${p.v}/${s}/${e}` : null; },
  },
  { name: "VidLink", ...tmdbPath("https://vidlink.pro") },
  { name: "YTHD", movie: (i) => (i.tmdb ? `https://ythd.org/embed/${i.tmdb}` : null), tv: (i, s, e) => (i.tmdb ? `https://ythd.org/embed/${i.tmdb}/${s}-${e}` : null) },
  { name: "2Embed", movie: twoEmbed("https://www.2embed.cc").movie, tv: () => null },
  { name: "VidNest", ...tmdbPath("https://vidnest.fun") },
  { name: "Viduki", movie: (i) => (i.tmdb ? `https://vidsrc.wtf/api/1/movie/?id=${i.tmdb}` : null), tv: (i, s, e) => (i.tmdb ? `https://vidsrc.wtf/api/1/tv/?id=${i.tmdb}&s=${s}&e=${e}` : null) },
  { name: "2Embed 2", movie: twoEmbed("https://www.2embed.skin").movie, tv: () => null },
];

// --- liveness ----------------------------------------------------------------------------------------------------
const TTL = 10 * 60 * 1000;
const seen = new Map<string, { at: number; ok: boolean }>();

async function alive(url: string): Promise<boolean> {
  const origin = new URL(url).origin;
  const hit = seen.get(origin);
  if (hit && Date.now() - hit.at < TTL) return hit.ok;
  let ok: boolean;
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" }, signal: AbortSignal.timeout(3000), redirect: "follow" });
    await res.body?.cancel().catch(() => {});
    ok = res.status < 500 && res.status !== 404;
  } catch {
    ok = false;
  }
  seen.set(origin, { at: Date.now(), ok });
  return ok;
}

/** What the picker would offer for this title, before the liveness check. */
export function embedsFor(media: "movie" | "tv", ids: TitleIds, se = 1, ep = 1): MovieEmbed[] {
  const out: MovieEmbed[] = [];
  for (const h of HOSTS) {
    const url = media === "tv" ? h.tv(ids, se, ep) : h.movie(ids);
    if (url) out.push({ name: h.name, url });
  }
  return out;
}

/** The embeds worth showing now: dead hosts are left out (all of them, if every check failed, so the page is never empty
 *  because of a network blip on our side). Waits at most 3 seconds, then treats an unanswered host as alive. */
export async function liveEmbeds(media: "movie" | "tv", ids: TitleIds, se = 1, ep = 1): Promise<MovieEmbed[]> {
  const all = embedsFor(media, ids, se, ep);
  const checks = await Promise.all(all.map((e) => Promise.race([alive(e.url), new Promise<boolean>((r) => setTimeout(() => r(true), 3200))])));
  const up = all.filter((_, i) => checks[i]);
  return up.length ? up : all;
}

/** For the health page: every host's current answer. */
export async function serverHealth(): Promise<{ name: string; ok: boolean }[]> {
  const sample = embedsFor("movie", { imdb: "tt0111161", tmdb: 278 });
  return Promise.all(sample.map(async (e) => ({ name: e.name, ok: await alive(e.url) })));
}
