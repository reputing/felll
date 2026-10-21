# Cupcake

Anime streaming site, entirely on Cloudflare: Next.js on Cloudflare Workers
(via OpenNext), **Cloudflare D1** (SQLite) for the catalog and search, Cloudflare
Stream for any video you host yourself, and an optional
[Anivexa](https://github.com/walterwhite-69/Anivexa-API) backend (also a Worker)
for titles you don't host.

## How it fits together

```
AniList GraphQL ──sync──▶ Cloudflare D1 ◀──binding── Next.js (Cloudflare Worker)
Jikan (MAL rating) ──┘    anime / episodes /          │
                          video_sources / views       ├─ /api/play signs a Stream token
your master file ──tus──▶ Cloudflare Stream ──HLS──▶  │
AniList id ──────────────▶ Anivexa Worker ──HLS──▶ /api/anivexa/proxy ──▶ hls.js player
```

| Layer | What it does |
|---|---|
| **Catalog** | Every AniList anime (~20k titles) mirrored into D1: titles in EN/romaji/native, synonyms, genres, tags, studios, characters, staff, season, format, status, origin, score, popularity, trailer, next airing episode. MAL age ratings (G…R+) via Jikan. |
| **Search** | Built in the Worker as SQLite over D1: an FTS5 **trigram** index for substring and partial-title matching ("frier" → Frieren), a prefix bonus for type-ahead, JSON-array filters (genres, tags, studios, characters, staff) and a popularity tie-breaker. Filters: genres, tags, year, season, format, status, origin, audio, rating, studio, character, staff. Sorts: best match, popularity, trending, score, year, recently updated, title. |
| **Trending** | Your own views over the last 14 days plus AniList's trending number, so a new site isn't empty. |
| **Video** | Each episode can have one or more `video_sources` ("servers"), each a Cloudflare Stream video or a self-hosted HLS URL, with an audio track (sub/dub/raw) and priority. The player lists them, switches on click and falls through to the next if one fails. |
| **External providers** | Optional. With `ANIVEXA_API_URL` set, titles you don't self-host become watchable through the Anivexa aggregator: episode lists and stream sources from 12 providers, keyed by the anime's AniList ID, shown as extra "servers" after any self-hosted ones. |
| **Playback security** | Stream videos require signed URLs. `/api/play/:id` signs a 4-hour RS256 token locally, so URLs can't be hot-linked and no API call is spent per play. |

Pages: `/` (landing), `/home` (trending, recently updated, top airing,
popular, top rated, upcoming), `/search`, `/anime/:slug`,
`/watch/:slug?ep=N` (skip intro/outro, resume, auto-next), `/schedule`.

## Quick start (one command)

Bring up D1, the schema, the Anivexa Worker and the site, with a starter
catalog, in one go. Your token stays in your own shell — it is never committed.

```bash
npm install
export CLOUDFLARE_API_TOKEN=...      # D1:Edit + Workers Scripts:Edit
export CLOUDFLARE_ACCOUNT_ID=...     # optional; auto-detected from `wrangler whoami`
npm run setup:cloudflare             # creates D1, applies schema, deploys both Workers, syncs ~1,000 titles
```

Options: `SKIP_SYNC=1` to skip the starter sync, `SYNC_PAGES=N` to change its
size (default 40 pages ≈ 1,000 titles).

Then attach your domain: **Workers & Pages → `felll` → Settings → Domains &
Routes → Add → Custom domain → `cupcake.gg`** (and `www.cupcake.gg`). Cloudflare
creates the DNS records and the certificate.

That's it — the site is live with a catalog, and playback works immediately
through Anivexa. Everything below is the manual version of those same steps.

## Manual setup

### 1. Cloudflare D1

```bash
npx wrangler login
npx wrangler d1 create cupcake          # copy the database_id it prints
# paste it into wrangler.jsonc → d1_databases[0].database_id
npm run d1:schema                        # apply d1/schema.sql to the remote DB
```

### 2. Catalog

The sync scripts write to D1 over its HTTP API. Put these in `.env.local` (and,
for the GitHub Action, as repo secrets): `CLOUDFLARE_API_TOKEN` (D1:Edit),
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`.

```bash
npm run sync:catalog -- --pages 40   # quick start: 1,000 most popular titles
npm run sync:catalog                 # everything (~30 min, AniList rate limits)
npm run sync:ratings                 # MAL age ratings, 500 at a time
npm run sync:airing                  # refresh airing titles / schedule
```

`.github/workflows/sync-catalog.yml` runs the airing sync every 3 hours and the
full sync weekly — add the three `CLOUDFLARE_*` values above as repository
secrets.

### 3. Cloudflare Stream (optional — only to self-host video)

1. Enable Stream and create an API token with **Stream: Edit**. Put it in
   `CLOUDFLARE_STREAM_API_TOKEN`, with `CLOUDFLARE_ACCOUNT_ID`.
2. Create a signing key once:
   ```bash
   curl -X POST -H "Authorization: Bearer $CLOUDFLARE_STREAM_API_TOKEN" \
     https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/stream/keys
   ```
   Put `result.id` in `STREAM_SIGNING_KEY_ID` and `result.jwk` in
   `STREAM_SIGNING_KEY_JWK`.
3. Set `STREAM_CUSTOMER_DOMAIN` to your `customer-xxxx.cloudflarestream.com` host.

### 4. Upload episodes (optional)

**Automatic.** One subfolder per anime, named by its slug (the part after
`/anime/` in the site URL) or `anilist-<id>`:

```
uploads/
  frieren-beyond-journeys-end-k3x9qa/
    01.mkv                        episode 1, sub
    01.en.vtt                     captions for 01.mkv (.srt works too)
    02 - Aura the Guillotine.mkv  episode 2 with a title
    02.dub.mkv                    episode 2, dub
```

```bash
npm run upload:folder -- --dir ./uploads   # upload everything new, then exit
npm run upload:watch  -- --dir ./uploads   # keep running; new files go live on their own
```

**One episode at a time:**

```bash
npm run upload -- --anime frieren-beyond-journeys-end-k3x9qa --episode 1 \
  --file ./masters/frieren-01.mkv --title "The Journey's End" \
  --captions en:./subs/frieren-01.en.vtt

npm run upload -- --anime anilist:154587 --episode 1 \
  --hls-url https://media.example.com/frieren/01/master.m3u8 --label "Backup" --priority 1
```

Both upload resumably (tus), wait for Stream to encode, attach captions and
register the source. The D1 triggers update the sub/dub counts automatically.

### 5. External providers with Anivexa (optional)

To fill the catalog without hosting video, run the vendored Anivexa backend —
a read-only aggregator that resolves 12 providers from an AniList ID. A
Cloudflare-Worker build lives in `anivexa/`:

```bash
npm run anivexa:dev        # run locally → http://localhost:8799
npm run anivexa:deploy     # deploy the "anivexa-api" Worker
```

Point the site at it with the `ANIVEXA_API_URL` var in `wrangler.jsonc` (the
one-shot setup fills this in), or `http://localhost:8799` in `.env.local` for
dev. How the site uses it:

- `lib/anivexa.ts` fetches `/episodes/:anilistId` and merges those episodes into
  each anime's list (self-hosted episodes always take precedence).
- `/api/anivexa/stream/...` resolves one playable stream per provider/episode.
- `/api/anivexa/proxy` streams the upstream HLS through our origin, applying the
  `Referer`/auth headers providers require (a browser can't set `Referer`) and
  rewriting the m3u8 so segments and keys go through the proxy too. It refuses
  non-HTTP(S) and private/loopback hosts.

**Workers build caveat.** Some upstream providers need a real Node runtime
Workers don't offer. In this build: `animedunya` was ported from a `curl`
subprocess to `fetch` (works); `senshi` / `anipm` / `mkissa` lose their
TLS-impersonation client (`wreq-js`) and fall back to plain `fetch`, so strict
anti-bot origins may block them; and the `megaplay` extractor (`node:vm`) is
disabled. The aggregator reports per-provider errors and returns whatever else
succeeds. To run every provider, host the upstream Anivexa project on a Node
platform and set `ANIVEXA_API_URL` to that URL instead. Proxying video segments
through the Worker uses Worker CPU/subrequests — fine for a hobby deployment,
worth watching at scale.

### 6. Deploy

```bash
npx wrangler secret put STREAM_CUSTOMER_DOMAIN   # only if self-hosting video
npx wrangler secret put STREAM_SIGNING_KEY_ID
npx wrangler secret put STREAM_SIGNING_KEY_JWK
npm run deploy
```

`ANIVEXA_API_URL` and the D1 binding are plain config in `wrangler.jsonc`, not
secrets. Then add your domain under Workers → `felll` → Settings → Domains. The
Cloudflare API token and Stream API token are only for the scripts and must
never be given to the Worker.

## Development

```bash
cp .env.example .env.local        # fill in values
npm run d1:schema:local           # apply the schema to a local D1
npm run dev                       # http://localhost:3000
npm run typecheck
npm run preview                   # run the Worker build locally
```

For local data, run the sync scripts (they write to the remote D1), or seed the
local DB with `wrangler d1 execute cupcake --local --command "..."`.

## Data sources and terms

- **AniList**: free for non-commercial use; commercial use needs their
  permission. Cover and banner images are served from AniList's CDN.
- **Jikan / MyAnimeList**: used only for age ratings.
- **Video**: only upload content you own or have licensed for streaming in the
  regions you serve.
- **Anivexa**: the external-provider integration is optional and off unless you
  set `ANIVEXA_API_URL`. It aggregates third-party streaming sources; you are
  responsible for whether running it is lawful where you operate.
```
