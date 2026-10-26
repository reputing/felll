# sinkaroid/jandapress — a Rust/Axum REST API for nhentai + other doujinshi
# sites, built from source. wrangler builds + pushes this on deploy.
#
# ⚠️ ADULT: doujinshi (18+). The frontend surfaces it only behind the 18+ gate
# (users.adult_ok), via its own /read/doujin catalogue. Deploy only if you want
# doujin on the site.
#
# nhentai is reached through nhentai's official /api/v2 (no Cloudflare bypass),
# but it can still greylist a busy datacenter IP — smoke-test /nhentai/search
# after deploying before surfacing the source.
FROM rust:1.96-slim-bookworm AS builder
WORKDIR /usr/src/jandapress
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git pkg-config libssl-dev \
  && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/sinkaroid/jandapress.git . \
  && cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libssl3 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/src/jandapress/target/release/jandapress /app/jandapress
ENV PORT=3000
# GraphQL off — we only call the REST routes (/nhentai/*).
ENV JANDAPRESS_GRAPHQL=false
EXPOSE 3000
CMD ["/app/jandapress"]
