# Keeps cupcake's catalog fresh from outside Cloudflare (where Jikan answers).
#
#   docker build -f sync/Dockerfile -t cupcake-sync .
#   docker run -d --restart unless-stopped --env-file .env cupcake-sync
#
# Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (with "D1: Edit") in the
# env file; wrangler uses them instead of a browser login. Runs a full sync on
# start, then again every SYNC_EVERY_HOURS (default 6).
FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY lib ./lib
COPY scripts ./scripts
COPY migrations ./migrations
COPY wrangler.jsonc tsconfig.json ./
COPY sync/loop.sh ./sync/loop.sh

ENV SYNC_EVERY_HOURS=6 \
    WRANGLER_SEND_METRICS=false
CMD ["sh", "sync/loop.sh"]
