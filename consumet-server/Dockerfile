# Consumet API built FROM SOURCE (not the prebuilt image), so it ships the
# latest @consumet/extensions — including the ComicK provider (comick.io), which
# has the broadest embeddable English coverage. wrangler builds + pushes this on
# `npm run consumet:container:deploy` (or the "Deploy container" CI workflow).
FROM node:20-slim

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

# Clone the Consumet API and build it. The repo is Fastify + TypeScript; build
# the dist if there's a build step, then start.
RUN git clone --depth 1 https://github.com/consumet/api.consumet.org . \
  && npm install \
  && (npm run build || echo "no build step, starting from source")

ENV NODE_ENV=PROD
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
