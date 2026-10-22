# Full Anivexa backend (all 12 providers, wreq-js, node:vm/child_process) running
# as a real Node server on Cloudflare Containers. The container-worker.js Worker
# routes requests to this on port 4000.
FROM node:20-slim

WORKDIR /app

# ca-certificates for outbound TLS (AniList, providers); curl is used by some
# providers via child_process.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=4000
ENV CACHE_ENABLED=false
EXPOSE 4000

CMD ["node", "server.js"]
