# Second manga source: the Consumet API (github.com/consumet/api.consumet.org),
# run as-is on Cloudflare Containers. The official prebuilt image already starts
# the Fastify server on port 3000, so there is nothing to build or maintain here
# — this is effectively a one-line Dockerfile, and wrangler builds + pushes it
# for you on `npm run consumet:container:deploy` (no manual docker commands).
#
# If a scraper ever goes stale and you want the very latest @consumet/extensions,
# swap this file for the from-source build in README.md.
FROM riimuru/consumet-api:latest

ENV NODE_ENV=PROD
ENV PORT=3000
EXPOSE 3000
