# Native movie/TV resolver: no ad-carrying player scripts ever run. It asks the
# providers' JSON APIs for an HLS URL, decodes their public response envelopes,
# and relays the media bytes from an explicit host allowlist. Zero npm deps.
FROM node:22-slim
WORKDIR /app
COPY server.mjs .
ENV PORT=8000
EXPOSE 8000
USER node
CMD ["node", "server.mjs"]
