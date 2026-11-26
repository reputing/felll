# overnight audit (12 nov 2026)

A long probing pass over cupcake.gg after the movies/series launch. What was
checked, what was fixed, what still needs a human.

## fixed

- **login redirect hardening** (`lib/auth.ts`): `safeNext` now rejects control
  characters (header splitting). Spaces stay allowed so `/browse?q=one piece` works.
- **person pages** (`lib/people.ts`): unknown names get a negative cache entry, so
  a bad name no longer hits Wikidata and Wikipedia on every view.
- **broken posters** (`components/poster.tsx`): Cinemeta's image host 404s for
  unaired episodes and some titles. Posters now fall back (episode to series
  poster, then a labelled placeholder) instead of a blank box.
- **catalog outage** (`lib/cinema.ts`, hub, title page): if Cinemeta is down the
  user gets a "the catalog isn't answering" state with Try again, not a 500.
  `CINEMETA_URL` env overrides the upstream if it ever moves.
- **invalid episode** in a url falls back to the first real episode.
- **accessibility**: skip link and `<main id="main">`, dark-skin `--plum-faint`
  contrast raised. axe: 0 violations on hub, title, person, list, history.
- **player**: the 25s stuck detector shows "this one is taking too long" with
  Try another server / Reload. Phone settings open as a bottom sheet.
  A single configured server skips the liveness probe.
- **health + warming**: `/api/health` probes catalog, zeus, subtitles and the
  people sources (`lib/movie-health.ts`); the `*/20` cron also warms the four
  hub shelves so the first visitor after a quiet spell isn't cold.
- **katex** bumped to 0.16.47 (clears most of the advisory).

## measured

| what | result |
| --- | --- |
| API probe | 31 routes, all 401 unauthenticated, no 5xx |
| headers | HSTS present, http to https 308 on cupcake.gg |
| cold / warm page | hub 1.8s / 0.3s, film 1.5s, series 0.6s, person 3.75s |
| data coverage (120 sampled) | 120 have TMDB ids; English subs for 55/63 films, 56/57 series S1E1 |
| Zeus, 5 parallel browsers | 16/32 played (median 13s) |
| Zeus, same stuck titles one at a time | 5/6 played in 6 to 11s, 1 in 30s |

Takeaway: the parallel "stuck" results were load from one IP, not missing titles.
Real users come from different IPs. `scripts/movies-smoke.mjs` runs sequentially
for that reason; keep it that way.

## needs a human

1. **Cloudflare "Always Use HTTPS"** for the cupcake.gg and kuro.rip zones. A
   zone setting change was blocked for me. cupcake.gg is covered by the redirect
   in `middleware.ts`; `http://kuro.rip` still answers 200 (login is unaffected
   because no Secure cookie is set there, but voice needs https).
2. **Committed TMDB v4 token** in `anivexa/providers/mkissa.js` and
   `anivexa-server/providers/mkissa.js` (vendored upstream, read-only scope).
   Not ours, but rotate or strip it if those folders ship anywhere.
3. **katex**: one advisory remains and needs the 0.19 major (breaking). It needs
   prototype pollution to exploit, so left alone.
4. **dead code**: Moviebox routes `/api/movie/stream`, `/api/movie/proxy`,
   `lib/movies.ts` and the Moviebox container are unused now.
5. **Next 16** warns `middleware` is deprecated for `proxy`; OpenNext doesn't
   support `proxy` yet.
6. Light-skin `--plum-faint` contrast was not changed (only dark).
7. `MOVIE_ALLOW_AD_SERVERS=1` re-enables the ad-serving third-party embeds. Don't.

## how to re-run

```bash
npx tsc --noEmit
BASE=http://localhost:3000 TOKEN=<cupcake_session> node scripts/movies-smoke.mjs movie-tt0080761 tv-tt31510819
```
