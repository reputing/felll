# stabldev/mangareader-api — a Python FastAPI scraper of mangareader.to, built
# from source. wrangler builds + pushes this on
# `npm run mangareader:container:deploy`.
FROM python:3.12-slim

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/stabldev/mangareader-api.git . \
  && pip install --no-cache-dir -r requirements.txt

ENV PORT=3000
EXPOSE 3000

# fastapi[standard] ships the `fastapi` CLI; serve main.py on all interfaces.
CMD ["fastapi", "run", "main.py", "--host", "0.0.0.0", "--port", "3000"]
