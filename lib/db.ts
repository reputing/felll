import { getCloudflareContext } from "@opennextjs/cloudflare";

// D1 is the only database. Bindings come from wrangler.jsonc; in `next dev`
// initOpenNextCloudflareForDev() gives us a local (miniflare) copy.

export async function env(): Promise<CloudflareEnv> {
  return (await getCloudflareContext({ async: true })).env as CloudflareEnv;
}

export async function db(): Promise<D1Database> {
  return (await env()).DB;
}

/** Runs work after the response is sent (cache refreshes, counters). */
export async function background(p: Promise<unknown>) {
  try {
    (await getCloudflareContext({ async: true })).ctx.waitUntil(p.catch(() => {}));
  } catch {
    p.catch(() => {});
  }
}

export async function all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  const { results } = await (await db()).prepare(sql).bind(...params).all<T>();
  return results ?? [];
}

export async function first<T>(sql: string, ...params: unknown[]): Promise<T | null> {
  return (await (await db()).prepare(sql).bind(...params).first<T>()) ?? null;
}

export async function run(sql: string, ...params: unknown[]) {
  return (await db()).prepare(sql).bind(...params).run();
}

export const now = () => Math.floor(Date.now() / 1000);
