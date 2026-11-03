import { all, run } from "@/lib/db";
import type { ModelRow, Store } from "@/lib/ai";

// D1-backed model health (migration 0016). Kept apart from lib/ai.ts so that stays
// importable without a database.
export const d1Store: Store = {
  rows: () => all<ModelRow>("select id, ok, vision, tools, ms, err, checked_at from shh_models"),
  async upsert(r) {
    await run(
      `insert into shh_models (id, ok, vision, tools, ms, err, checked_at) values (?, ?, ?, ?, ?, ?, ?)
       on conflict(id) do update set ok = excluded.ok, vision = excluded.vision, tools = excluded.tools,
         ms = excluded.ms, err = excluded.err, checked_at = excluded.checked_at`,
      r.id, r.ok, r.vision, r.tools, r.ms, r.err, r.checked_at,
    );
  },
  // A lease in a spare row: take it only if it is older than `ttl`, so concurrent
  // page loads don't each kick off their own refresh.
  async lock(nowSec, ttlSec) {
    await run("insert or ignore into shh_models (id, ok, checked_at) values ('__lock', 0, 0)");
    const r = await run("update shh_models set checked_at = ? where id = '__lock' and checked_at < ?", nowSec, nowSec - ttlSec);
    return (r.meta?.changes ?? 0) > 0;
  },
};
