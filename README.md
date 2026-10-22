# cupcake.gg

A members-only anime watch box for **kuro**. The front door is a portal; past
it, kuro members can browse every anime on MyAnimeList, keep lists, rate,
comment, follow each other and watch the episodes you've uploaded.

Runs entirely on Cloudflare: Next.js 16 on Workers (OpenNext), D1 for data,
Stream for video, a Cron Trigger to keep the catalog cache warm. Anime data
comes from [Jikan](https://jikan.moe) (MyAnimeList).

```
            ┌──────────── Cloudflare Worker (Next.js via OpenNext) ────────────┐
visitor ──▶ │ /  portal ─ kuro SSO / password ─▶ session cookie                │
            │ /home /anime /watch /seasonal /schedule /rankings /u/… (members) │
            └──────┬──────────────────────┬───────────────────────┬────────────┘
                   │ D1                   │ edge cache + D1        │ signed URL
                   ▼                      ▼                        ▼
   members, lists, comments,      Jikan responses          Cloudflare Stream (HLS)
   presence, episodes/sources     (served stale if Jikan is down)
```

## What's in it

**The portal and the gate**
1. A portal at `/` with a drifting poster wall, live "online now" count and recent faces. Every other page and API needs a session.
2. Sign-in with kuro, one click if you're already signed in on kuro.rip (the same SSO hand-off kuro's sister sites use), or kuro handle + password through kuro's own app sign-in. `REQUIRE_KURO_PLUS=1` limits it to kuro+.

**Finding things**

3. The cupcake discover screen (`/home`): pick-of-the-week hero, keep watching, the filterable watch box, a closer-look panel, the weekly lineup and the top ten tray.
4. **Seasonal chart** (`/seasonal`): every show in a season, ranked by popularity, score, next episode, premiere date or title, each with a **live countdown** to its next episode or premiere. Browse back and forward through seasons, plus Upcoming/TBA.
5. **Airing schedule** (`/schedule`): a seven-day timeline in your own time zone, with a timer on every drop, "up next" highlighting and an "only my box" filter.
6. **Rankings** (`/rankings`): top airing, most anticipated, all time, most popular, most loved, top films, and cupcake's own chart (a weighted average of members' ratings).
7. **Episodes and drop dates** on every show: air dates, filler/recap flags, what's uploaded, and the next six drops with countdowns.
8. Browse/search all of MyAnimeList with stacking filters (format, status, genre or theme, year, age rating, sort), all in the URL.
9. A ⌘K / `/` command palette: anime, members and pages from anywhere.
10. "Because you liked X" recommendations, plus "Surprise me" (a random pick).
11. Show pages with characters and Japanese voices, relations, theme songs, official streaming links, a score spread (cupcake vs MAL) and a trailer modal.

**Watching**

12. A custom player in the site's theme: server and dub/sub switching with automatic failover, speed, captions, picture-in-picture, theater mode and fullscreen. Keyboard: space/k, j/l, ←/→, ↑/↓, m, f, t, c, s (skip intro), n/p, 0–9 and frame-step , and .
13. Skip intro (with a marker on the seek bar), optional auto-skip, and auto-next with a countdown.
14. Resume where you left off, and share a link at the current moment (`?t=`).
15. Progress tracking: at 85% an episode counts as watched, your list moves on and the show completes on the final episode.
16. Who's watching: "N watching now" on show pages, "N members are on this episode with you" on the watch page, and what everyone's watching in the header's online list.
17. Episode reactions (🔥😭😂🤯💖😴).
18. Requests: ask for a show that isn't uploaded yet and vote on others' requests. The upload script marks a request filled and notifies everyone who asked.

**Your stuff**

19. My box: watching, plan to watch, completed, on hold and dropped, plus favourites, a progress stepper and your scores.
20. 1–10 ratings with hover preview; cupcake's average shows next to MAL's.
21. Watch history grouped by day, which you can clear.
22. Stats: episodes, approximate hours, mean score and a day streak.

**Social**

23. Threaded comments on every show and every episode: replies, likes, whole-comment spoilers, inline `||spoilers||`, `@mentions`, edit/delete (admins can delete anything), and top/new sorting.
24. Notifications for replies, mentions, likes, new followers and filled requests.
25. Profiles (`/u/handle`): banner, accent colour, pronouns, status, bio, a top-four showcase, genre mix, stats, activity, latest comments, a live "watching now" pill and optional private lists.
26. A profile editor with a live preview (`/settings`).
27. Follows, plus a feed (people you follow / everyone).
28. Members directory with online dots, and 30-day leaderboards (episodes, comments, ratings).

**Look and feel**

29. Four skins: **Midnight** (black and pink, the default), Cupcake (the original cream and pink), Matcha and Lilac. Your choice is saved to your account.
30. Every menu, select, dialog, tooltip, confirm and toast is built from one shared style (`components/ui/popup.ts`), so they all follow the skin. The site never uses the browser's own dialogs.
31. Small 21st.dev-style touches: a spotlight glow that follows the cursor on cards, a shimmering primary button, a marquee poster wall, skeleton shimmer and rise-in animations. All of it is disabled when the visitor prefers reduced motion.

## Speed

The old site took around 60 s per page because every page was rendered on
demand and made several Supabase RPCs (trigram search and ranking over the
whole catalog) from a Worker to a distant database, with no caching. Now:

- **No page waits on MyAnimeList.** `lib/jikan.ts` checks isolate memory, then
  the Cloudflare edge cache, then D1. A stale copy is served immediately and
  refreshed after the response (`waitUntil`). Live calls are spaced to Jikan's
  3/s limit, time-boxed to 6 s, retried once, and served stale if Jikan is down.
- **The catalog lives in D1**, filled by `npm run sync` from outside
  Cloudflare, so pages never depend on Jikan answering the Worker. If a live
  call does fail, live calls pause for a minute instead of every page
  waiting out a timeout.
- **A Cron Trigger refreshes the cache every 20 minutes** (`worker.ts` →
  `/api/warm`) whenever Jikan does answer.
- **One D1 round trip per page** where possible (`db.batch`); the session
  lookup is shared across the request with React `cache()`.
- **Slow parts stream in.** Episodes, characters, recommendations and score
  charts are behind Suspense with skeletons; comments load only when scrolled
  near. A `loading.tsx` skeleton shows instantly on every navigation.
- **Light pages.** Mostly server components; hls.js (~400 KB) is loaded only
  when the browser can't play HLS natively; lucide and Radix imports are
  tree-shaken; images are MAL's own webp at the right size, lazy-loaded; the
  logo went from a 1920px PNG to 19 KB.

Measured on the production Worker build running locally (with Jikan
unreachable, so everything came from the D1 cache): every page rendered in
30–130 ms, including streamed sections. The Worker is 1.5 MB gzipped.

## Setup

### 1. Cloudflare

```bash
npm install
npx wrangler login
npx wrangler d1 create felll            # paste the database_id into wrangler.jsonc
npm run db:migrate                      # creates the tables in D1
```

Secrets for the Worker:

```bash
npx wrangler secret put KURO_SUPABASE_URL      # kuro's Supabase project url
npx wrangler secret put KURO_SERVICE_KEY       # kuro's service-role key (see below)
npx wrangler secret put ADMIN_HANDLES          # e.g. "jakael,someone"
npx wrangler secret put STREAM_CUSTOMER_DOMAIN
npx wrangler secret put STREAM_SIGNING_KEY_ID
npx wrangler secret put STREAM_SIGNING_KEY_JWK
npm run deploy
```

Then add your domain under Workers → `felll` → Settings → Domains.

### 2. Fill the catalog (required)

Jikan, like AniList, refuses requests from Cloudflare's shared Worker IPs, so
the Worker can't fetch MyAnimeList itself. A sync fetches it from somewhere
else and writes it into D1. The site reads from that copy and falls back to it
for everything: home, search, seasons, schedule, rankings and show pages.

```bash
npm run db:migrate          # once more, for the catalog table
npm run sync                # ~8 min (Jikan allows 60 requests a minute)
npm run sync -- --quick     # ~3 min, enough to see the site working
```

It uses your `wrangler login`. Keep it fresh with one of:

- **Docker**, on any machine you have running (not on Cloudflare):
  `docker compose -f sync/docker-compose.yml up -d --build`. It syncs on start,
  then every 6 hours. Put `CLOUDFLARE_ACCOUNT_ID` and a `CLOUDFLARE_API_TOKEN`
  with **D1: Edit** in `.env`.
- **GitHub Actions**: `.github/workflows/sync-catalog.yml` runs every 6 hours
  once you add those two values as repository secrets.

Signed in, open `/api/health` to see whether the Worker can reach Jikan and
how much is stored.

### 3. kuro sign-in

- **Handle + password** works as soon as the site is up: it asks kuro's
  `/api/app-login`, the endpoint the kuro apps use. Your password goes to kuro
  and is never stored here.
- **One-click "Continue with kuro"** is kuro's sister-site hand-off
  (`lib/sso.ts` in kirari). Two things are needed:
  1. `KURO_SERVICE_KEY` set here (kuro signs its one-time codes with its
     service key; nuzzle.lol holds the same key for the same reason).
  2. This site's domain added to `SISTER_SITES` in kirari's `lib/domains.ts`,
     so kuro will hand it a code.

The service key also lets cupcake read the member's kuro profile (display
name, avatar, kuro+, bans) at sign-in. Without it, password sign-in still
works, but profiles start from the handle alone.

### 4. Video (Cloudflare Stream)

Create a Stream signing key once and put `result.id` / `result.jwk` in the
secrets above:

```bash
curl -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/stream/keys
```

### 5. Upload episodes

Uploads are keyed by the **MyAnimeList id**, the number in a cupcake or MAL
URL (`/anime/52991`). The scripts write to D1 through Cloudflare's API, so
they need `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID` and a `CLOUDFLARE_API_TOKEN`
with **D1: Edit** and **Stream: Edit** (see `.env.example`).

```
uploads/
  52991-frieren/              folder = MAL id, then anything
    01.mkv                    episode 1, sub
    01.en.vtt                 captions for 01.mkv (.srt works too)
    02 - Aura the Guillotine.mkv
    02.dub.mkv                episode 2, dub
```

```bash
npm run upload:folder -- --dir ./uploads   # upload everything new, then exit
npm run upload:watch  -- --dir ./uploads   # keep watching; new files go live by themselves

npm run upload -- --anime 52991 --episode 1 --file ./frieren-01.mkv --captions en:./frieren-01.en.vtt
npm run upload -- --anime 52991 --episode 1 --hls-url https://media.example.com/f/01/master.m3u8 --label Backup
npm run upload -- --anime 52991 --episode 1 --intro 85-175 --outro 1310   # skip buttons
```

Uploads resume if interrupted, skip what's already live, and fill any open
request for that show.

## Development

```bash
cp .env.example .env.local
npm run db:migrate:local
npm run dev                  # http://localhost:3000
npm run typecheck
npm run preview              # the real Worker build, locally
```

In development the portal has a **Dev sign-in** box (a pretend member, no
kuro needed). It returns 404 in production builds.

## Files

```
app/page.tsx                 the portal (public)
app/sso/route.ts             kuro hand-off redeem
app/(members)/…              everything behind the gate (layout.tsx checks the session)
app/api/…                    auth, library, comments, presence, progress, play, …
lib/jikan.ts                 Jikan client, cache layers, normalisers, airing maths
lib/kuro.ts                  SSO code check, profile lookup, password sign-in
lib/auth.ts                  sessions
lib/db.ts                    D1 helpers
lib/store.ts                 client store (filters, library, toasts)
components/ui/popup.ts       the one style every popup uses
migrations/                  D1 schema
worker.ts                    Worker entry + cache-warming cron
scripts/                     uploaders
```

## Data and terms

- **Jikan / MyAnimeList**: metadata and images. Jikan is free and unofficial;
  please keep the caching in place so it isn't hammered.
- **Video**: only upload content you own or have licensed for streaming in the
  regions you serve.

## Adding components

`components.json` is set up for the shadcn and 21st.dev CLIs:

```bash
npx shadcn@latest add "https://21st.dev/r/<author>/<component>"
```

Restyle what you add with the theme tokens in `app/globals.css` (`cream`,
`paper`, `line`, `frost`, `plum`, `night`, `sprinkle-*`), and use `POPUP`
from `components/ui/popup.ts` for anything that floats, so it follows the skin.
