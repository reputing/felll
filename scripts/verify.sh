#!/usr/bin/env bash
# The checks every change must pass before it goes out: typecheck, the Next build, and the Cloudflare
# (OpenNext) build that production actually deploys. Stops at the first failure and exits non-zero, so
# nothing downstream (a push, a deploy) can run on a broken build.
#
# `next build` sometimes stops once to print a package security advisory ("Retry the same command to
# continue"); that is not a code failure, so a failed Next build is retried once before it counts.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> typecheck";            npx tsc --noEmit
echo "==> next build"
if ! npm run build >/tmp/verify-next.log 2>&1; then
  if grep -q "SecurityFatalError" /tmp/verify-next.log; then
    echo "   (next printed a security advisory and stopped; retrying once)"
    npm run build >/tmp/verify-next.log 2>&1 || { tail -40 /tmp/verify-next.log; echo "next build FAILED"; exit 1; }
  else
    tail -40 /tmp/verify-next.log; echo "next build FAILED"; exit 1
  fi
fi
echo "==> cloudflare build";     npx opennextjs-cloudflare build >/tmp/verify-open.log 2>&1 || { tail -40 /tmp/verify-open.log; echo "cloudflare build FAILED"; exit 1; }
echo "all checks passed"
