# Cupcake

Anime streaming site for **episodes you hold the rights to**: Next.js on
Cloudflare Workers, Supabase Postgres for the catalog and search, and
Cloudflare Stream for video.

## How it fits together

```
AniList GraphQL ──sync──▶ Supabase Postgres ◀──RPC── Next.js (Cloudflare Worker)
Jikan (MAL rating) ──┘     anime / episodes /            │
                           video_sources / views         │ /api/play signs a token
your master file ──tus──▶ Cloudflare Stream ──HLS──▶ hls.js player
```

| Layer | What it does |
|---|---|
| **Catalog** | Every AniList anime (~20k titles): titles in EN/romaji/native, synonyms, genres, tags, studios, characters, staff, season, format, status, origin, score, popularity, trailer, next airing episode. MAL age ratings (G…R+) via Jikan. |
| **Search** | One Postgres function, `search_anime`, blending full-text rank (titles weighted above descriptions), trigram similarity (typos like "fireren", "naurto"), a prefix bonus for type-ahead, and a popularity tie-breaker. Filters: genres, tags, year, season, format, status, origin, audio (sub/dub), rating, studio, character, staff. Sorts: best match, popularity, trending, score, year, recently updated, title. |
| **Trending** | Your own daily views (decaying 15% per day over 14 days) plus AniList's trending number, so a new site isn't empty. |
| **Video** | Each episode has one or more `video_sources` ("servers"), each a Cloudflare Stream video or a self-hosted HLS URL, with an audio track (sub/dub/raw) and priority. The player lists them, switches on click and falls through to the next one if a source fails. |
| **Playback security** | Stream videos require signed URLs. `/api/play/:id` signs a 4-hour RS256 token locally, so URLs can't be hot-linked and no API call is spent per play. |
| **Sub/dub counts** | `anime.sub_episodes` / `dub_episodes` are kept current by triggers on your sources, so cards show "CC 12 · 🎙 8 · 24" without joins. |

Pages: `/` (landing), `/home` (trending, recently updated, top airing,
popular, top rated, upcoming), `/search`, `/anime/:slug`,
`/watch/:slug?ep=N` (skip intro/outro, resume, auto-next), `/schedule`.
Titles switch between English and romaji with the EN/JP toggle.

## Setup

### 1. Supabase

1. Create a project and apply the migration:
   `npx supabase link --project-ref <ref> && npx supabase db push`
   (or paste `supabase/migrations/*.sql` into the SQL editor).
2. Copy `.env.example` to `.env` and fill in the project URL, anon key and
   service-role key (Project settings → API).

### 2. Catalog

```bash
npm install
npm run sync:catalog -- --pages 40   # quick start: 1,000 most popular titles
npm run sync:catalog                 # everything (~30 min, AniList rate limits)
npm run sync:ratings                 # MAL age ratings, 500 at a time
npm run sync:airing                  # refresh airing titles / schedule
```

`.github/workflows/sync-catalog.yml` runs the airing sync every 3 hours and
the full sync weekly. Add `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` as repository secrets.

### 3. Cloudflare Stream

1. Enable Stream on your Cloudflare account and create an API token with
   **Stream: Edit**. Put it in `CLOUDFLARE_STREAM_API_TOKEN`, with
   `CLOUDFLARE_ACCOUNT_ID`.
2. Create a signing key once:
   ```bash
   curl -X POST -H "Authorization: Bearer $CLOUDFLARE_STREAM_API_TOKEN" \
     https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/stream/keys
   ```
   Put `result.id` in `STREAM_SIGNING_KEY_ID` and `result.jwk` in
   `STREAM_SIGNING_KEY_JWK`.
3. Set `STREAM_CUSTOMER_DOMAIN` to your `customer-xxxx.cloudflarestream.com`
   host (shown on any video's embed code).

### 4. Upload episodes

```bash
npm run upload -- --anime frieren-beyond-journey-s-end-16w8tc --episode 1 \
  --file ./masters/frieren-01.mkv --title "The Journey's End" \
  --captions en:./subs/frieren-01.en.vtt

# A dub track or a backup server for the same episode:
npm run upload -- --anime anilist:154587 --episode 1 --file ./frieren-01-dub.mkv --audio dub
npm run upload -- --anime anilist:154587 --episode 1 \
  --hls-url https://media.example.com/frieren/01/master.m3u8 --label "Backup" --priority 1
```

The script uploads resumably (tus), waits for Stream to encode, attaches
captions and registers the source. The episode appears on the site as soon
as it finishes. Intro/outro timestamps (`episodes.intro_start`, `intro_end`,
`outro_start`) enable the skip buttons.

### 5. Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
npx wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
npx wrangler secret put STREAM_CUSTOMER_DOMAIN
npx wrangler secret put STREAM_SIGNING_KEY_ID
npx wrangler secret put STREAM_SIGNING_KEY_JWK
npm run deploy
```

Then add your domain under Workers → `felll` → Settings → Domains. The
service-role key and Stream API token are only for the scripts and must
never be given to the Worker.

## Development

```bash
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
npm run typecheck
npm run preview              # run the Worker build locally
```

## Data sources and terms

- **AniList**: the API is free for non-commercial use; commercial use needs
  their permission. Cover and banner images are served from AniList's CDN.
- **Jikan / MyAnimeList**: used only for age ratings.
- **Video**: only upload content you own or have licensed for streaming in
  the regions you serve.
