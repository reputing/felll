#!/bin/sh
# Sync now, then every SYNC_EVERY_HOURS. A failed run is retried next round.
while true; do
  echo "[$(date -u +%FT%TZ)] syncing"
  npx tsx scripts/sync-jikan.ts $SYNC_ARGS || echo "sync failed, will retry next round"
  sleep "$(( ${SYNC_EVERY_HOURS:-6} * 3600 ))"
done
