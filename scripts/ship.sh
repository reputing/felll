#!/usr/bin/env bash
# Verify, then push the current commit to the dev branch and to production (production deploys from CI).
# Merges production in first if it has moved (never force-pushes). Usage: npm run ship
set -euo pipefail
cd "$(dirname "$0")/.."
PROD=claude/sweet-bell-gpo325
DEV=${DEV_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}
[ -z "$(git status --porcelain)" ] || { echo "commit your changes first"; exit 1; }
git fetch -q origin "$PROD"
git merge --no-edit "origin/$PROD"
bash scripts/verify.sh
git push -q origin "HEAD:$DEV"
git push origin "HEAD:$PROD"
echo "pushed; the Deploy workflow builds and publishes it"
