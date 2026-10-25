# GooglyBlox/comick-source-api — a Next.js manga scraper (comick/mangapark/etc.),
# built from source. wrangler builds + pushes this on deploy.
FROM node:20-slim

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/GooglyBlox/comick-source-api.git . \
  && npm install \
  && npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
