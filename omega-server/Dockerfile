# Shineii86/OmegaAPI — a Next.js API for omegascans.org (ADULT manhwa), built
# from source. wrangler builds + pushes this on `npm run omega:container:deploy`.
FROM node:20-slim

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/Shineii86/OmegaAPI.git . \
  && npm install \
  && npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
