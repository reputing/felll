# Cupcake — full-stack handoff

Anime streaming site, entirely on **Cloudflare**. Browse/search a full AniList
catalog; play episodes either from your own uploads or, via the bundled
**Anivexa** aggregator, from 12 third-party providers resolved by AniList ID.

> **This README is a handoff doc.** It describes exactly what's deployed, what
> works, what doesn't and why, and a prioritized list of what to fix next.

---

## 1. What it runs on (this deployment)

| Thing | Value |
|---|---|
| Cloudflare account subdomain | `matthewsjakael` (so Workers are `*.matthewsjakael.workers.dev`) |
| Plan | **Workers Paid** ($5/mo) — required for Cloudflare Containers |
| Frontend (site) Worker | `felll` → `https://felll.matthewsjakael.workers.dev` |
| Custom domain | `cupcake.gg` (attached, or being attached, as a custom domain on the `felll` worker) |
| Catalog DB | Cloudflare **D1**, database name `cupcake` (binding `DB`) |
| Backend (Anivexa) | Cloudflare **Containers** worker `anivexa-api` → `https://anivexa-api.matthewsjakael.workers.dev` |
| Backend URL wired into site | `ANIVEXA_API_URL` var in `wrangler.jsonc` |
| Dev machine | **Windows**, using **Git Bash** (paths like `/c/Users/axtze/felll`). Docker Desktop installed (needed for container deploys). |

Local dev gotcha (Windows): in Git Bash use forward slashes (`cd /c/Users/...`).
`npm install` rewrites `package-lock.json` for win32; if `git pull` complains,
run `git checkout -- package-lock.json` first (don't commit the local lockfile).

---

## 2. Architecture

```
AniList GraphQL ──sync (GH Action/local)──▶ Cloudflare D1 ◀──binding(DB)── Next.js site (Worker "felll")
Jikan (MAL ratings) ──┘                     anime / episodes /              │
                                            video_sources / views           │
your own masters ──tus──▶ Cloudflare Stream ──signed HLS──▶ /api/play ──────┤
                                                                            │ hls.js player
AniList ID ──▶ Anivexa backend (Container "anivexa-api") ──▶ /api/anivexa/* │
              (12 providers, resolves episodes + stream URLs)   proxy ──────┘
```

- **Catalog/search/metadata**: D1 (SQLite). Synced from AniList.
- **Self-hosted video** (optional, mostly unused right now): Cloudflare Stream +
  `video_sources` rows + `/api/play` signed URLs.
- **External video** (the main path today): Anivexa resolves episode lists and
  per-episode stream URLs; the site proxies the HLS through `/api/anivexa/proxy`
  so the required `Referer` headers are applied server-side.

---

## 3. Tech stack & repo map

Stack: Next.js 16 (App Router) on **OpenNext → Cloudflare Workers**, React 19,
Tailwind v4, Cloudflare D1, Cloudflare Containers, hls.js, tus (uploads).

```
app/
  layout.tsx, globals.css        # shell + theme tokens (dark plum, pink accent #ff7aa8)
  page.tsx                       # landing
  home/page.tsx                  # trending / popular / airing rows (searchAnime)
  search/page.tsx                # filters + pagination
  anime/[slug]/page.tsx          # details + episode grid + Watch buttons
  watch/[slug]/page.tsx          # player + episode sidebar (merges local + Anivexa)
  schedule/page.tsx              # airing schedule
  api/
    search/route.ts              # header search-box suggestions
    view/route.ts                # view counter (trending)
    play/[sourceId]/route.ts     # signs a Cloudflare Stream URL for a self-hosted source
    anivexa/stream/[provider]/[anilistId]/[audio]/[ep]/route.ts  # resolve 1 external stream
    anivexa/proxy/route.ts       # HLS proxy: applies Referer, rewrites m3u8 children
components/
  Header, Footer, SearchBox, AnimeCard, Player, LocalTime, TitleLanguageToggle
  AppLink.tsx                    # plain <a> used instead of next/link (see Known Issues)
lib/
  db.ts                          # D1 binding access (getCloudflareContext)
  catalog.ts                     # searchAnime + all catalog reads + getWatchEpisodes/Sources
  anivexa.ts                     # Anivexa client: catalog fetch, stream resolve, proxy URL builder, provider order
  stream.ts                      # Cloudflare Stream RS256 token signing
  types.ts                       # Anime, Episode, VideoSource, WatchEpisode, PlayerSource, ...
  titles.ts, format.ts           # title language + label helpers
d1/
  schema.sql                     # D1 schema (SQLite): tables, FTS5 trigram search, count triggers
scripts/
  setup-cloudflare.sh            # one-shot bring-up (D1 + schema + both workers + starter sync + deploy)
  d1.ts                          # D1 HTTP API client used by the sync/upload scripts
  sync-anilist.ts, sync-ratings.ts
  upload-episode.ts, upload-folder.ts, uploader.ts   # self-host video → Stream → D1
anivexa-server/                  # ★ ACTIVE Anivexa backend (Cloudflare Containers, full Node)
  Dockerfile, container-worker.js, wrangler.jsonc
  index.js, server.js, core/, providers/, extractors/
anivexa/                         # ⚠ LEGACY Anivexa backend (Workers-only, stubbed). Not used. See §6.
```

---

## 4. Data layer (D1)

`d1/schema.sql` is a SQLite port of the original Postgres schema:
- `anime` — catalog mirror of AniList (arrays stored as JSON text, booleans as 0/1).
- `episodes`, `video_sources`, `subtitles` — self-hosted playback.
- `anime_daily_views` — trending counter.
- **Search**: an FTS5 **trigram** virtual table (`anime_fts`) over the title
  variants gives substring + partial matching ("frier" → Frieren). Trigram is
  weaker than the old Postgres `pg_trgm` on letter-transposition typos.
- **Triggers** keep `anime.sub_episodes/dub_episodes/latest_episode_at` in step
  with `video_sources` (replaces the old Postgres function).

Access: `lib/db.ts` → `getCloudflareContext().env.DB`. All pages are
`force-dynamic`. `lib/catalog.ts::searchAnime` builds parameterized SQL (FTS +
prefix bonus + `json_each` filters + `COUNT(*) OVER()` pagination).

Apply schema: `npm run d1:schema` (remote) / `npm run d1:schema:local` (dev).

### Catalog sync & uploads
- `npm run sync:catalog [-- --pages N]`, `sync:airing`, `sync:ratings` — pull
  AniList/Jikan and write to D1 over the D1 **HTTP API** (`scripts/d1.ts`).
  Needs `CLOUDFLARE_API_TOKEN` (D1:Edit), `CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_D1_DATABASE_ID`. GH Action `.github/workflows/sync-catalog.yml`
  runs these on a schedule (add those 3 as repo secrets).
- `npm run upload[:folder|:watch]` — upload your own masters to Cloudflare
  Stream and register `video_sources`. Mostly unused today but fully wired.

---

## 5. Playback pipeline

1. `watch/[slug]` calls `getWatchEpisodes(anime)` which **merges** self-hosted
   episodes (D1) with Anivexa's episode list (by `anime.anilist_id`). Returns a
   unified episode list + the Anivexa provider summaries.
2. `getWatchSources(anime, episode, providers)` builds `PlayerSource[]`:
   self-hosted "servers" first, then one entry per Anivexa provider that has
   this episode (sub/dub). Providers are ordered by reliability (see
   `ANIVEXA_PROVIDERS` in `lib/anivexa.ts`) so the **default server actually plays**.
3. `components/Player.tsx` (hls.js): for a local source it hits
   `/api/play/:id`; for an Anivexa source it hits
   `/api/anivexa/stream/:provider/:anilistId/:audio/:ep`.
4. `/api/anivexa/stream/...` → `lib/anivexa.ts::resolveAnivexaStream`: calls the
   backend, picks the best stream (active HLS → HLS → DASH → embed), and returns
   a **ready URL**. For HLS/DASH the URL points at `/api/anivexa/proxy`; for
   `embed` it's the raw URL (player shows it in an `<iframe>`).
5. `/api/anivexa/proxy` fetches the upstream with the provider's `Referer`
   (and any headers), and **rewrites m3u8 child URIs** to go back through the
   proxy too (so segments/keys also carry the Referer). It also **sniffs for
   `#EXTM3U`** so playlists served with a bogus content-type (e.g. AniWaves
   serves m3u8 as `image/jpeg`) are still rewritten. Binary segments/keys are
   passed through untouched. It refuses non-HTTP(S) and private/loopback hosts
   (SSRF guard).

---

## 6. Anivexa backend — two builds

Anivexa is the upstream project `walterwhite-69/Anivexa-API`, vendored twice:

### `anivexa-server/` — ACTIVE (Cloudflare Containers, full Node)
Runs the real Node server in a container, so all providers (incl. `wreq-js`
TLS-impersonation, `node:vm`, `child_process`) work.
- Deploy: `npm run anivexa:container:deploy` (**Docker Desktop must be running**;
  Cloudflare builds the image locally and pushes it).
- `container-worker.js` fronts the container via `@cloudflare/containers`,
  keeps it **warm 1h** (`sleepAfter`), and passes cache env (`CACHE_ENABLED`,
  optional `UPSTASH_*`) into it.
- **Patch applied** in `anivexa-server/core/anilist.js`: send `Origin`/`Referer`
  on the AniList GraphQL call, and **fall back to ani.zip** for title + MAL id
  when AniList is blocked. Without this, AniList rate-limits Cloudflare egress
  and ~11/12 providers fail with "No data found". This patch is baked into the
  image, so **re-run `anivexa:container:deploy` after editing it**.

### `anivexa/` — LEGACY (Workers-only). Do not use.
A stubbed Workers build (no `wreq-js`, no `vm`). On Workers, AniList blocks the
metadata fetch from Cloudflare's shared edge IPs, so almost every provider
returns "No data found". Kept only for reference. `ANIVEXA_API_URL` should
point at the **container** worker, not this.

> **Key lesson:** the IP a request egresses from matters. Even Cloudflare
> Containers egress from Cloudflare's network, which some hosts/AniList
> rate-limit or block. A plain VPS / Oracle free VM often has a cleaner IP.

---

## 7. Provider status (observed, for Attack on Titan / AniList 16498)

| Provider | Status | Notes |
|---|---|---|
| **Anikoto** | ✅ works | clean HLS, reliable — default server |
| **AnimeGG** | ✅ works | `embed` (iframe to animegg.org) |
| **AniWaves** | ✅ works (after proxy sniff fix) | serves m3u8 as `image/jpeg`; sniff fix handles it |
| **Reanime** | ⚠ test | HLS (flixcloud); should work, verify |
| **KickAssAnime (kaa)** | ⚠ test | HLS; verify |
| **Senshi** | ⚠ speed-dependent | stream URLs **expire ~60s** → only plays if backend is warm/fast (hence the cache/warm container). Shows `Cannot GET …/playlist.m3u8` when expired. |
| **MKissa** | ⚠ flaky | resolves episodes; playback often fails |
| **AnimeNoSub** | ❌ can't fix from proxy | returns an anti-hotlink HTML wall ("Portal Security → Go to Official Site") instead of video |
| **Ani.pm** | ❌ can't fix from proxy | host (`settlar.io`) returns **403** to our server IP |
| **AnimeOnsen** | ❌ unsupported | **DASH** manifest; player only does HLS |
| **AniZone** | ❌ usually | "match not confident" for many titles |
| **AnimeDunya** | ❌ usually | empty / no match |

**Realistic ceiling: ~4–6 working providers per popular title.** The ❌ rows
are blocked by the *hosts themselves* (anti-hotlink, IP bans, DASH) — no proxy
change serves their bytes. This is inherent to scraping aggregators.

---

## 8. Known issues & current workarounds

1. **Client-side navigation was broken (worked around).** Under OpenNext on
   Cloudflare, RSC requests get a `307` that strips the `?_rsc` value, so Next's
   soft navigation stalls — a left-click did nothing (only open-in-new-tab
   worked). **Workaround:** `components/AppLink.tsx` renders a plain `<a>` and we
   use it instead of `next/link` everywhere; search submit and the EN/JP toggle
   use `window.location`. Trade-off: **full page loads, no SPA nav/prefetch.**
   *Possible real fix: a newer OpenNext, or a Cloudflare routing rule for RSC.*
2. **Slowness / Senshi expiry.** Backend re-scrapes all 12 providers live; cold
   starts + no cache made lookups take many seconds, which blew Senshi's 60s
   window. **Workaround:** container kept warm 1h + `CACHE_ENABLED` (in-memory);
   add Upstash for a persistent cache. First load of a cold title is still slow.
3. **Disguised m3u8 (fixed).** Proxy now sniffs `#EXTM3U`.
4. **Embeds / DASH / anti-hotlink / IP-blocks** — not fixable from our side (see §7).

---

## 9. Environment & secrets

Site worker (`wrangler.jsonc` `vars`, not secret): `NEXT_PUBLIC_SITE_NAME`,
`ANIVEXA_API_URL` (→ the container worker URL), the `DB` d1 binding
(`database_id` filled by setup).
Site secrets (only if self-hosting video): `STREAM_CUSTOMER_DOMAIN`,
`STREAM_SIGNING_KEY_ID`, `STREAM_SIGNING_KEY_JWK`.
Scripts (`.env.local` / repo secrets): `CLOUDFLARE_API_TOKEN` (D1:Edit +
Workers Scripts:Edit), `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`,
and `CLOUDFLARE_STREAM_API_TOKEN` for uploads.
Container (`anivexa-server/wrangler.jsonc` vars + secrets): `CACHE_ENABLED=true`,
optional `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (set via
`wrangler secret put ... -c anivexa-server/wrangler.jsonc`).

---

## 10. Deploy runbooks

**Site (frontend) — most changes:**
```bash
git pull
npm run deploy            # opennextjs-cloudflare build + deploy → worker "felll"
```
**Backend (container) — changes under anivexa-server/ (needs Docker running):**
```bash
npm run anivexa:container:deploy
# prints https://anivexa-api.matthewsjakael.workers.dev — put in wrangler.jsonc ANIVEXA_API_URL, then npm run deploy
```
**One-shot first-time bring-up:** `export CLOUDFLARE_API_TOKEN=... ; npm run setup:cloudflare`
(creates D1, applies schema, deploys the *legacy Workers* anivexa — switch
`ANIVEXA_API_URL` to the **container** afterward, syncs a starter catalog,
deploys the site).
**Domain:** Workers & Pages → `felll` → Settings → Domains & Routes → Add custom
domain → `cupcake.gg` (+ `www`).

Everything typechecks with `npm run typecheck`. D1 search/triggers were
validated locally against a real SQLite D1.

---

## 11. What to fix next (prioritized, for Opus 5.5)

1. **Confirm latest deploys are live.** Run `npm run deploy` (site) and
   `npm run anivexa:container:deploy` (backend). Verify `ANIVEXA_API_URL` has **no
   `felll` in it** (correct: `https://anivexa-api.matthewsjakael.workers.dev`).
2. **Add Upstash Redis to the container** for a persistent cache — biggest
   remaining speed win; also helps Senshi. (Free tier; set `UPSTASH_*` secrets.)
3. **Trim dead-end providers** from the UI — hide/disable AnimeNoSub, Ani.pm,
   AnimeOnsen (and maybe AniZone/AnimeDunya) so viewers never click a server
   that can't play. Edit `ANIVEXA_PROVIDERS` / the source-building in
   `lib/anivexa.ts` + `lib/catalog.ts::getWatchSources`.
4. **Backend latency:** the episode aggregation waits on *all* providers
   (`Promise.all`). Add per-provider timeouts / return early so one slow/blocked
   provider doesn't gate the response. (`anivexa-server/core/episode-strategy.js`,
   `episode-cache.js`.)
5. **Reconsider the navigation workaround.** Full-page loads work but lose SPA
   feel. Try a newer `@opennextjs/cloudflare`, or investigate the `?_rsc` 307 —
   if fixed, revert `AppLink` back to `next/link`.
6. **Reliability ceiling → self-hosting.** The only path to "every title plays,
   instantly, forever" is hosting your own video. The pieces exist
   (`video_sources.hls_url`, `/api/play`, hls.js, the upload scripts). Recommended:
   an **R2** (zero-egress) pipeline — `ffmpeg` → HLS ladder → R2 → signed URL —
   for flagship titles, with Anivexa as the best-effort long-tail fallback. Not
   built yet.
7. Optional: **DASH support** (dash.js) to recover AnimeOnsen; a residential
   proxy to recover IP-blocked hosts (costs money). Both low priority.

---

## 12. Data sources & terms

- **AniList** (catalog, free non-commercial), **Jikan/MAL** (age ratings).
- **Self-hosted video**: only upload content you own or have licensed.
- **Anivexa**: optional, off unless `ANIVEXA_API_URL` is set. It aggregates
  third-party streams — free because the bytes are someone else's, which is also
  why it's fragile and legally grey. You are responsible for lawful operation.
```
