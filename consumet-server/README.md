# consumet-server — the second manga source

A self-hosted [Consumet API](https://github.com/consumet/api.consumet.org) running
on **Cloudflare Containers**, same pattern as `anivexa-server/`. The frontend uses
it **only** as an English fallback: when MangaDex has no English for a title (not
even official links), the reader searches this for English chapters. Everything
else still comes straight from MangaDex.

It is **off until you deploy it and set `CONSUMET_API_URL`** in the root
`wrangler.jsonc`. Until then manga behaves exactly as before (MangaDex only).

## Deploy

From the repo root (Docker must be running locally so wrangler can build the
image — you don't write or run any docker commands yourself):

```bash
npm run consumet:container:deploy
```

Wrangler builds the `Dockerfile` here, pushes it to Cloudflare's own registry,
and deploys the `consumet-api` Worker + container. Copy the deployed URL it
prints (e.g. `https://consumet-api.<you>.workers.dev`).

## Turn it on

In the root `wrangler.jsonc`, uncomment and set:

```jsonc
"CONSUMET_API_URL": "https://consumet-api.<you>.workers.dev",
```

then redeploy the site (`npm run deploy`). That's it — titles MangaDex has no
English for will start resolving English chapters through this.

## Verify

```bash
# search (expect {"results":[...]})
curl "https://consumet-api.<you>.workers.dev/manga/mangapill/jujutsu%20kaisen"
# chapters for a result id
curl "https://consumet-api.<you>.workers.dev/manga/mangapill/info?id=<id>"
# pages for a chapter id (expect [{"page":1,"img":"https://...","headerForImage":{...}}])
curl "https://consumet-api.<you>.workers.dev/manga/mangapill/read?chapterId=<id>"
```

The frontend tries providers in this order: `mangapill`, `mangahere`,
`mangakakalot` (see `lib/manga-consumet.ts`). All are English and need no login.

## Image headers

Some manga CDNs require a `Referer` header that a browser `<img>` can't send.
Consumet returns that header per page as `headerForImage`; the site re-sends it
through its own image proxy at `/api/consumet/img`, so pages load. Nothing to
configure.

## Alternative: build from source (freshest scrapers)

The prebuilt image is convenient but can lag behind site changes. To always run
the latest `@consumet/extensions`, replace `Dockerfile` with:

```dockerfile
FROM node:20-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN git clone --depth 1 https://github.com/consumet/api.consumet.org . \
  && npm install
ENV NODE_ENV=PROD
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
```

Then `npm run consumet:container:deploy` again.
