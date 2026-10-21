#!/usr/bin/env bash
# One-shot Cloudflare bring-up for Cupcake: D1 + schema + Anivexa Worker + the
# site Worker, with a starter catalog sync. Run it from the repo root AFTER
# putting your token in your own shell:
#
#   export CLOUDFLARE_API_TOKEN=...        # D1:Edit (+ Workers Scripts:Edit, + Stream:Edit if uploading)
#   export CLOUDFLARE_ACCOUNT_ID=...       # optional; auto-detected from `wrangler whoami`
#   npm run setup:cloudflare
#
# Safe to re-run. Skip the catalog sync with SKIP_SYNC=1. Change how much of the
# catalog the starter sync pulls with SYNC_PAGES=N (default 40 ≈ 1,000 titles).
set -euo pipefail

cd "$(dirname "$0")/.."
WRANGLER="npx --yes wrangler@4"
DB_NAME="cupcake"
SYNC_PAGES="${SYNC_PAGES:-40}"

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN is not set. Export it first (D1:Edit + Workers Scripts:Edit)." >&2
  exit 1
fi

# --- Account id ------------------------------------------------------------
if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  bold "Detecting Cloudflare account id…"
  WHOAMI="$($WRANGLER whoami 2>/dev/null || true)"
  CLOUDFLARE_ACCOUNT_ID="$(printf '%s' "$WHOAMI" | grep -oE '[0-9a-f]{32}' | head -n1 || true)"
  if [[ -z "$CLOUDFLARE_ACCOUNT_ID" ]]; then
    echo "Could not detect CLOUDFLARE_ACCOUNT_ID. Set it and re-run." >&2
    exit 1
  fi
fi
export CLOUDFLARE_ACCOUNT_ID
echo "Account: $CLOUDFLARE_ACCOUNT_ID"

# --- D1 database -----------------------------------------------------------
bold "Ensuring D1 database '$DB_NAME' exists…"
CREATE_OUT="$($WRANGLER d1 create "$DB_NAME" 2>&1 || true)"
DB_ID="$(printf '%s' "$CREATE_OUT" | grep -oE '[0-9a-f-]{36}' | head -n1 || true)"
if [[ -z "$DB_ID" ]]; then
  # Already exists — find it in the list.
  DB_ID="$($WRANGLER d1 list --json 2>/dev/null \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const l=JSON.parse(s);const m=l.find(x=>x.name==='$DB_NAME');process.stdout.write(m?(m.uuid||m.database_id||''):'')})")"
fi
if [[ -z "$DB_ID" ]]; then
  echo "Could not create or find the D1 database '$DB_NAME'." >&2
  echo "$CREATE_OUT" >&2
  exit 1
fi
export CLOUDFLARE_D1_DATABASE_ID="$DB_ID"
echo "D1 database id: $DB_ID"

bold "Writing the D1 id into wrangler.jsonc…"
node -e "const fs=require('fs');const p='wrangler.jsonc';let t=fs.readFileSync(p,'utf8');t=t.replace(/(\"database_id\":\s*\")[^\"]*(\")/,'\$1$DB_ID\$2');fs.writeFileSync(p,t)"

bold "Applying the schema to D1…"
$WRANGLER d1 execute "$DB_NAME" --remote --file d1/schema.sql

# --- Anivexa backend -------------------------------------------------------
bold "Deploying the Anivexa backend Worker…"
ANIVEXA_OUT="$($WRANGLER deploy -c anivexa/wrangler.jsonc 2>&1 | tee /dev/stderr || true)"
ANIVEXA_URL="$(printf '%s' "$ANIVEXA_OUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -n1 || true)"
if [[ -n "$ANIVEXA_URL" ]]; then
  echo "Anivexa URL: $ANIVEXA_URL"
  bold "Pointing the site at the Anivexa Worker…"
  node -e "const fs=require('fs');const p='wrangler.jsonc';let t=fs.readFileSync(p,'utf8');t=t.replace(/(\"ANIVEXA_API_URL\":\s*\")[^\"]*(\")/,'\$1$ANIVEXA_URL\$2');fs.writeFileSync(p,t)"
else
  echo "Could not detect the Anivexa URL; set ANIVEXA_API_URL in wrangler.jsonc by hand." >&2
fi

# --- Starter catalog -------------------------------------------------------
if [[ "${SKIP_SYNC:-0}" != "1" ]]; then
  bold "Syncing a starter catalog ($SYNC_PAGES pages ≈ $((SYNC_PAGES * 25)) titles)…"
  npm run sync:catalog -- --pages "$SYNC_PAGES"
fi

# --- Site ------------------------------------------------------------------
bold "Building and deploying the site…"
npm run deploy

bold "Done."
echo "Next: attach your domain in the dashboard — Workers & Pages → felll →"
echo "Settings → Domains & Routes → Add → Custom domain → cupcake.gg (and www)."
echo "Deepen the catalog any time with:  npm run sync:catalog   (and npm run sync:ratings)"
