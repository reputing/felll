# Shineii86/VortexScansAPI — English manhwa API (vortexscans.org), Node, built
# from source. Its server.js routes to the repo's handlers for self-hosting.
# wrangler builds + pushes this on `npm run vortexscans:container:deploy`.
FROM node:20-slim

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/Shineii86/VortexScansAPI.git . \
  && npm install

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
