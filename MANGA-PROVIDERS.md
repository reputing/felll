# Manga providers

How cupcake.gg sources manga, and the self-host servers available as Cloudflare
Containers.

## How the reader resolves a title

The main reader is keyed by **MangaDex** title (`lib/manga.ts`). For each title
it picks the best *readable, in-app* source, in this order, and only falls back
to an official/external link when nothing readable exists anywhere:

1. MangaDex English, when it's a complete run (reads from MangaDex's own CDN).
2. **weebcentral** via the comick-source-api container (`lib/manga-weeb.ts`) —
   most reliable for licensed manhwa WITH pages.
3. **comick.io** (`lib/manga-comick.ts`).
4. **Consumet** (`lib/manga-consumet.ts`) — aggregates the major English sites.
5. MangaDex's partial English run, then the best non-English run.
6. Only if all of the above miss: the official/external links.

Everything but step 6 renders **inside the reader** — no redirects. Page images
load straight from each source's CDN (through `/api/manga-img` when a Referer is
needed), never by bouncing the reader to another site.

## 18+ (adult) manga

18+ is served by **MangaDex itself**, which hosts a large adult catalogue
(hentai, doujinshi, adult manhwa) under its `pornographic` content rating. The
reader reads every page of it in-app from MangaDex's CDN — same as any other
title, no redirect.

- The SFW browse (`safe` / `suggestive` / `erotica`) is the default everywhere.
- Members an admin has approved (`users.adult_ok`, set at `/admin/manhwa`) get an
  **18+ toggle** on the manga page (`components/manga/browse.tsx`). Turning it on
  adds `pornographic` to search / popular / browse.
- Chapter feeds always allow every rating, so once you've opened any title you
  can read it whatever its rating.

This replaced **OmegaAPI** (omegascans), which was an unreliable adult scraper
container in its own `/read/omega` section. It's been retired: MangaDex's adult
catalogue is larger, reads in-app, and needs no extra container.

**Doujinshi** is a separate 18+ category MangaDex carries less of, served by its
own source at `/read/doujin` (jandapress → nhentai + other doujin sites, see
`jandapress-server/`). It's 18+ gated the same way (`users.adult_ok`, enforced
in the `/api/manga-src` proxy). nhentai has no plain listing, so the landing is a
broad default feed (`feedKey: "english"`) reordered by the **sort tabs** (Popular
/ Trending / New) with tappable **tag chips**, plus free-text search. Each gallery
is one book, so it maps onto the reader as a single-chapter title. Covers come
back as relative thumb paths and **hotlink straight from the nhentai thumb CDN**
(`t.nhentai.net`), not through `/api/manga-img` — that proxy round trip was why
the grid was slow; chapter page images still proxy. Reading a doujin is **never
broadcast to presence** (it's adult, and the source reader doesn't call
`setReading`); members can also hide all reading via the settings toggle. ⚠️
`/nhentai/search` can be greylisted on busy datacenter IPs even via nhentai's
official API — smoke-test after deploying.

## Live today

- **MangaDex** — primary source, SFW + 18+, English by default (`lib/manga.ts`).
- **weebcentral** (`comick-server/`, var `WEEB_API_URL`) — licensed manhwa with
  pages. Wired as the first second-source.
- **comick.io** / **Consumet** (`consumet-server/`, var `CONSUMET_API_URL`) —
  further English fallbacks.
- **VortexScans** (`vortexscans-server/`, var `VORTEXSCANS_API_URL`) — SFW manhwa
  with its own catalogue, at `/read/vortexscans`.
- **Doujin** (`jandapress-server/`, var `DOUJIN_API_URL`) — doujinshi (18+) at
  `/read/doujin`, gated on `adult_ok`. Wired; needs a deploy + smoke-test.

## Self-host server containers

Each folder is a Cloudflare Container project in the shape of `anivexa-server/`.
Deploy with its npm script (Docker running locally; wrangler builds + pushes the
image). Point the frontend at one by setting its `*_API_URL` var in the root
`wrangler.jsonc` and redeploying.

| Folder | Source | Language | Deploy | Wired in? |
|---|---|---|---|---|
| `comick-server/` | comick-source-api → weebcentral + 60-odd sites | English | `npm run comick:container:deploy` | ✅ first second-source (weeb) |
| `consumet-server/` | Consumet (many English sites) | English | `npm run consumet:container:deploy` | ✅ English fallback |
| `vortexscans-server/` | VortexScansAPI → vortexscans.org | English manhwa | `npm run vortexscans:container:deploy` | ✅ own section `/read/vortexscans` |
| `jandapress-server/` | jandapress → nhentai + other doujin sites | English | `npm run doujin:container:deploy` | ✅ own section `/read/doujin` (18+); needs deploy + smoke-test |
| `mangareader-server/` | stabldev/mangareader-api | English | `npm run mangareader:container:deploy` | ❌ no page-image endpoint; Consumet covers this site |
| `manga-id-server/` | febryardiansyah/manga-api | Indonesian | `npm run manga-id:container:deploy` | ⬜ non-English |
| `mango-server/` | la-lo-go/man-go | Spanish (WIP) | `npm run mango:container:deploy` | ⬜ non-English |

The own-catalogue source machinery (`lib/manga-sources.ts`, the `/read/<source>`
pages, the `/api/manga-src` proxy with the adult gate) now carries VortexScans
(SFW) and Doujin (18+); add another own-catalogue source by extending `SOURCES`
there.

## Candidate providers (evaluated 2026-10)

These were reviewed as replacements for omega and as extra sources. Verdicts:

**Added**

- **sinkaroid/jandapress** — Rust/Axum, has a Dockerfile, self-hostable. Scrapes
  nhentai (via nhentai's official `/api/v2`, so no Cloudflare bypass) plus
  pururin / hentaifox / asmhentai / 3hentai / hentai2read / simply-hentai. The
  best **doujin** API of the list. **Now wired** as the `doujin` own-catalogue
  18+ source (`jandapress-server/`, `/read/doujin`). Shape used:
  `GET /nhentai/search?key=&page=&sort=popular` → `{data:[{id,title:{pretty},cover,total}]}`;
  `GET /nhentai/get?book=<id>` → `{data:{id,title,image:[<page urls on i.nhentai.net>],num_pages}}`.
  Each gallery is a single "chapter", so it maps onto the source reader as a
  one-chapter title. **Still needs:** a deploy (`npm run doujin:container:deploy`)
  + a `/nhentai/search` smoke-test from the Worker, since nhentai can greylist
  shared datacenter IPs even through its official API.
- **GooglyBlox/comick-source-api** — already what `comick-server/` runs (69
  sources, actively maintained, the most reliable of the scrapers). Headroom:
  wire more of its sources as additional second-source fallbacks.

**Not a fit**

- **Sumidoku** (Rust) — a full self-hosted *library* app (Aidoku WASM sources,
  OPDS, stateful `/config` + `/downloads` volumes), not a stateless scraper API.
  Would be a large, awkward fit on Cloudflare Containers; interesting but not a
  drop-in.
- **Syron01/anicore-api** — metadata only (AniList/Kitsu), no chapters or page
  images. We already use AniList/Jikan for metadata.
- **SeaNotSi/nimeku-api** — static JSON files built by GitHub Actions (MangaDex +
  nhentai), not a running HTTP API. Confirms nhentai page images hotlink.
- **ArisRhiannon/mangatype** — typesetting *helper* (suggests font/size), not a
  translator and returns no images. Page translation is a separate OCR +
  inpaint + translate pipeline; this is only one sub-step.
- **AbstractUmbra/Hondana** — a Python *library* for the MangaDex API (needs your
  own OAuth login), not a server. Its lesson (MangaDex's `pornographic` rating)
  is exactly what the 18+ reader now uses directly.
- **sulvii/hentai-api** — mostly hentai *video* (hanime/hentaihaven) + Rule34;
  its manga sources are listed as planned, not implemented. Needs Redis.
- **atsumaruz/atsumaru-anime-api** — anime *video* (HLS), heavy Supabase + TMDB
  auth. Tangential to manga; anime streaming already has anivexa/consumet.

**Dead / empty**

- **HuynhKimHuy/nexus_manga_api** — an untouched NestJS starter (1 commit, no
  endpoints).
- **anuark22/MangaProjectApi** — a .NET skeleton (1 commit, no docs/endpoints).
- **nhentai-dev/API** — a JS client library, marked deprecated by its author.
- **SylveonDeko/NHentaiAPI** — a C# client library (returns image bytes), not a
  server.
- **jeric-basco22/hentai-haven-stream-suite** — a promotional wrapper with no
  documented endpoints or Dockerfile; unverifiable.

## Repos that are NOT servers (can't be API containers)

From earlier lists, these aren't content-serving HTTP APIs:

- `fumiama/copymanga` — an Android app (Chinese)
- `Mangatsu/server` — a host-your-own-files library server, not a content source
- `Nyora-Manga/nyora-js` — a client SDK/library, no longer maintained
- `editinghero/Koka` — a tracking dashboard app
- `viz-manga` (PyPI) — a Python library; VIZ also needs a paid login
- `walterwhite-69/MangaVault` — a server, but ships no dependency manifest
