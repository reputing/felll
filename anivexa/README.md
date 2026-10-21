# Anivexa backend (Cloudflare Worker build)

A vendored, Workers-compatible copy of the [Anivexa API](https://github.com/walterwhite-69/Anivexa-API)
(v2.3) — the aggregator that resolves anime episode lists and stream sources
across 12 providers from an AniList ID. The Cupcake site talks to this over
`ANIVEXA_API_URL`.

Run and deploy from the repo root:

```bash
npm run anivexa:dev      # http://localhost:8799
npm run anivexa:deploy   # Worker "anivexa-api"
```

## Differences from upstream

Upstream targets a Node server (`server.js`) / Vercel edge. This copy drops
those entry points and deploys `index.js` (already an `export default { fetch }`
Worker) via `wrangler.jsonc` with `nodejs_compat`. To load on Workers, the
Node-only pieces were changed:

- `providers/animedunya.js` — `fetchHtml` ported from a `curl` subprocess
  (`node:child_process`) to `fetch`.
- `core/wreq.js` — the native TLS-impersonation client (`wreq-js`) is replaced
  by a `fetch` fallback (affects senshi / anipm / mkissa under strict anti-bot).
- `extractors/megaplay.js` — disabled; it needs `node:vm`.
- `core/smartcache.js` — the on-disk cache branch is kept off on Workers (no
  filesystem); the in-memory and optional Upstash Redis caches still work.

Everything else is upstream. To run all providers with full fidelity, host the
upstream project on a Node platform and point `ANIVEXA_API_URL` there instead.
