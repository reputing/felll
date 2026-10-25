# febryardiansyah/manga-api (Indonesian manga, Node + Express + cheerio), built
# from source. wrangler builds + pushes this on
# `npm run manga-id:container:deploy`.
FROM node:20-slim

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/febryardiansyah/manga-api.git . \
  && npm install \
  && npm run build

ENV NODE_ENV=production
ENV MODE=PRODUCTION
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
