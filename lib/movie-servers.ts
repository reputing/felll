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

// Servers are named for Greek gods, like the anime ones (lib/anivexa.ts). Zeus is the site's own player (a direct stream),
// which is why no embed here uses that name.
//
// ADS. These are third-party players, and nearly all of them are paid for by pop-unders and ad overlays. Every host was
// run in a real browser with repeated clicks while counting popups, ad-network requests and overlays:
//   - Apollo (Viduki) opened no popups, asked an ad network for nothing and showed no overlay, for films and episodes:
//     it is the only one on by default.
//   - Poseidon (VidSrc.to), Hermes (VidLink) and Ares (VidNest) each opened a popup window and called ad networks
//     (rapidadexchange, adsco); Athena (YTHD) plays but captions its own ad on the picture; Artemis (2Embed, both
//     domains) answers "this video file cannot be played". Those are kept below, off, in case one is ever wanted; the
//     MOVIE_ALLOW_AD_SERVERS=1 variable turns them on.
// A sandboxed iframe would stop the popups, but every one of these refuses to play in one (tested with five different
// sandbox flag sets), so the only way to a clean player is to leave the others out.
const HOSTS: Host[] = [
  { name: "Apollo", movie: (i) => (i.tmdb ? `https://vidsrc.wtf/api/1/movie/?id=${i.tmdb}` : null), tv: (i, s, e) => (i.tmdb ? `https://vidsrc.wtf/api/1/tv/?id=${i.tmdb}&s=${s}&e=${e}` : null) },
];

const AD_HOSTS: Host[] = [
  { name: "Poseidon", movie: (i) => { const p = imdbOrTmdb(i); return p ? `https://vidsrc.to/embed/movie/${p.v}` : null; }, tv: (i, s, e) => { const p = imdbOrTmdb(i); return p ? `https://vidsrc.to/embed/tv/${p.v}/${s}/${e}` : null; } },
  { name: "Hermes", ...tmdbPath("https://vidlink.pro") },
  { name: "Ares", ...tmdbPath("https://vidnest.fun") },
  { name: "Athena", movie: (i) => (i.tmdb ? `https://ythd.org/embed/${i.tmdb}` : null), tv: (i, s, e) => (i.tmdb ? `https://ythd.org/embed/${i.tmdb}/${s}-${e}` : null) },
  { name: "Artemis", movie: twoEmbed("https://www.2embed.cc").movie, tv: () => null },
];

/** Where the embeds are allowed to load from: the page's frame-src lists exactly these, so a frame that tries to redirect
 *  itself somewhere else is blocked by the browser. (Viduki's own page lives on www.viduki.net.) */
export const FRAME_ORIGINS = ["https://vidsrc.wtf", "https://viduki.net", "https://www.viduki.net"];

import { getCloudflareContext } from "@opennextjs/cloudflare";

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
export function embedsFor(media: "movie" | "tv", ids: TitleIds, se = 1, ep = 1, withAds = false): MovieEmbed[] {
  const out: MovieEmbed[] = [];
  for (const h of withAds ? [...HOSTS, ...AD_HOSTS] : HOSTS) {
    const url = media === "tv" ? h.tv(ids, se, ep) : h.movie(ids);
    if (url) out.push({ name: h.name, url });
  }
  return out;
}

/** The embeds worth showing now: dead hosts are left out (all of them, if every check failed, so the page is never empty
 *  because of a network blip on our side). Waits at most 3 seconds, then treats an unanswered host as alive. */
export async function liveEmbeds(media: "movie" | "tv", ids: TitleIds, se = 1, ep = 1): Promise<MovieEmbed[]> {
  let withAds = false;
  try { withAds = ((await getCloudflareContext({ async: true })).env as unknown as Record<string, string | undefined>).MOVIE_ALLOW_AD_SERVERS === "1"; } catch { withAds = process.env.MOVIE_ALLOW_AD_SERVERS === "1"; }
  const all = embedsFor(media, ids, se, ep, withAds);
  const checks = await Promise.all(all.map((e) => Promise.race([alive(e.url), new Promise<boolean>((r) => setTimeout(() => r(true), 3200))])));
  const up = all.filter((_, i) => checks[i]);
  return up.length ? up : all;
}

/** For the health page: every host's current answer. */
export async function serverHealth(): Promise<{ name: string; ok: boolean }[]> {
  const sample = embedsFor("movie", { imdb: "tt0111161", tmdb: 278 }, 1, 1, true);
  return Promise.all(sample.map(async (e) => ({ name: e.name, ok: await alive(e.url) })));
}
