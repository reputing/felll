# Manga providers

How cupcake.gg sources manga, and the self-host servers available as Cloudflare
Containers.

## Live today

- **MangaDex** — the primary source, English by default (see `lib/manga.ts`).
- **Consumet** (`consumet-server/`) — optional second English source, wired as a
  fallback when MangaDex has no English for a title. It aggregates the major
  English sites (mangareader.to, mangapill, mangahere, mangakakalot, mangadex)
  in one API, WITH page images. Off until `CONSUMET_API_URL` is set.

## Self-host server containers (deploy on Cloudflare Containers)

Each folder is a Cloudflare Container project in the same shape as
`anivexa-server/`. Deploy with its npm script (Docker running locally; wrangler
builds and pushes the image — no manual docker commands):

| Folder | Source | Language | Deploy | Wired in? |
|---|---|---|---|---|
| `consumet-server/` | Consumet (many English sites) | English | `npm run consumet:container:deploy` | ✅ English fallback |
| `vortexscans-server/` | VortexScansAPI → vortexscans.org | English manhwa | `npm run vortexscans:container:deploy` | ⬜ needs a browse section (own catalogue) |
| `mangareader-server/` | stabldev/mangareader-api → mangareader.to | English | `npm run mangareader:container:deploy` | ❌ no page-image endpoint; Consumet covers this site with pages |
| `manga-id-server/` | febryardiansyah/manga-api | Indonesian | `npm run manga-id:container:deploy` | ⬜ non-English |
| `mango-server/` | la-lo-go/man-go | Spanish (WIP) | `npm run mango:container:deploy` | ⬜ non-English |
| `omega-server/` | OmegaAPI → omegascans.org | English, ADULT 18+ | `npm run omega:container:deploy` | ⬜ needs 18+ browse section |

After deploying one, point the frontend at it by setting the matching var in the
root `wrangler.jsonc` (e.g. `CONSUMET_API_URL`) and redeploying the site.

## Why most of these aren't wired into the reader yet

The reader resolves chapters **by MangaDex title** — the fallback fires when a
title in MangaDex's (SFW-filtered) catalogue has no English. That design lets
Consumet fill English gaps, but it can't surface a provider whose content lives
in its **own** catalogue:

- **VortexScans** and **OmegaAPI** have their own series lists; their titles are
  mostly not in MangaDex's browse, so a by-title fallback rarely triggers for
  them. To actually use them they need a **dedicated browse section** (search +
  grid + reader), and OmegaAPI additionally needs an **18+ gate** since it's
  adult (omegascans).
- **mangareader-api** exposes search / detail / chapter-list but **no
  page-image endpoint**, so it can't drive a reader. Consumet already scrapes
  mangareader.to *with* pages, so that site is covered.
- **manga-api** (Indonesian) and **man-go** (Spanish) are non-English; they'd be
  wired only if you want those languages in the picker.

So: the containers are all deployable now. Turning VortexScans / OmegaAPI into
something readers actually see is a separate feature (per-source browse + 18+
gate) — ask and it's the next build.

## Repos that are NOT servers (can't be API containers)

From the original list, these aren't content-serving HTTP APIs, so there's
nothing to containerize:

- `fumiama/copymanga` — an Android app (Chinese)
- `Mangatsu/server` — a host-your-own-files library server, not a content source
- `Nyora-Manga/nyora-js` — a client SDK/library, marked "No Longer Maintained"
- `editinghero/Koka` — a tracking dashboard app
- `viz-manga` (PyPI) — a Python library; VIZ also needs a paid login
- `walterwhite-69/MangaVault` — a server, but ships no dependency manifest, so it
  can't be built reproducibly without guessing its dependencies
