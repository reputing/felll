# Consumet API on Cloudflare Containers. Uses the official prebuilt image (the
# source repo consumet/api.consumet.org was taken down, so a from-source build
# isn't currently possible). This image serves mangapill/mangahere/mangakakalot
# etc. with page images. wrangler builds + pushes this on deploy.
#
# NOTE: this image predates the ComicK provider. comick is still listed first in
# lib/manga-consumet.ts and simply falls through to the others here. To get
# ComicK, wire a dedicated comick API (e.g. GooglyBlox/comick-source-api) as its
# own container + provider — a follow-up.
FROM riimuru/consumet-api:latest

ENV NODE_ENV=PROD
ENV PORT=3000
EXPOSE 3000
