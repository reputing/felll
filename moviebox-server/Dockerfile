# Moviebox-API (github.com/faisaljs/Moviebox-API) running as a Python/FastAPI
# server on Cloudflare Containers. container-worker.js routes requests here on
# port 8000. The app is a separate repo, so it's pulled at build time.
#
# Note: the container filesystem is ephemeral — the SQLite catalog is rebuilt on
# a cold start (a 2-3 min background walk). cupcake's movie client falls back to
# the live /home + /search endpoints while that runs, so browsing still works.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Pin to a tag/commit by appending `&& git checkout <ref>` if you want stability.
RUN git clone --depth 1 https://github.com/faisaljs/Moviebox-API.git .
RUN pip install --no-cache-dir -r requirements.txt

ENV HOST=0.0.0.0
ENV PORT=8000
EXPOSE 8000

CMD ["python", "main.py"]
