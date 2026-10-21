// Talks to Cloudflare D1 over its HTTP API, so the sync/upload scripts can
// populate the same database the site reads through its binding. Needs, in
// .env.local / .env (or the shell):
//   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (D1 edit), CLOUDFLARE_D1_DATABASE_ID
import { requireEnv } from "./lib";

const API = "https://api.cloudflare.com/client/v4";

// D1 allows at most 100 bound parameters per query.
export const MAX_BOUND_PARAMS = 100;

/** Run one SQL statement with bound params; returns the first result set's rows. */
export async function d1Query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const account = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const dbId = requireEnv("CLOUDFLARE_D1_DATABASE_ID");
  const token = requireEnv("CLOUDFLARE_API_TOKEN");

  const res = await fetch(`${API}/accounts/${account}/d1/database/${dbId}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const body = (await res.json()) as {
    success: boolean;
    errors?: unknown;
    result?: { results?: T[] }[];
  };
  if (!res.ok || !body.success) {
    throw new Error(`D1 query failed (${res.status}): ${JSON.stringify(body.errors ?? body)}`);
  }
  return body.result?.[0]?.results ?? [];
}

/** Run an async mapper over items with bounded concurrency. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
