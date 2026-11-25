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
# run a build step; retry once only when it stopped on that advisory notice
step() {
  local name="$1" log="$2"; shift 2
  echo "==> $name"
  if ! "$@" >"$log" 2>&1; then
    if grep -q "SecurityFatalError" "$log"; then
      echo "   (next printed a security advisory and stopped; retrying once)"
      "$@" >"$log" 2>&1 || { tail -40 "$log"; echo "$name FAILED"; exit 1; }
    else
      tail -40 "$log"; echo "$name FAILED"; exit 1
    fi
  fi
}
step "next build" /tmp/verify-next.log npm run build
step "cloudflare build" /tmp/verify-open.log npx opennextjs-cloudflare build
echo "all checks passed"
