import { getCloudflareContext } from "@opennextjs/cloudflare";

// Minimal D1 surface we use — avoids a hard dependency on @cloudflare/workers-types.
export interface D1Result<T> {
  results: T[];
  success: boolean;
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result<unknown>>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

/** The Cloudflare D1 binding declared in wrangler.jsonc as `DB`. */
export function db(): D1Database {
  const { env } = getCloudflareContext();
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) {
    throw new Error(
      "D1 binding DB is not configured. Add the d1_databases binding in wrangler.jsonc and apply d1/schema.sql.",
    );
  }
  return binding;
}

/** Run a query and return all rows. */
export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const stmt = params.length ? db().prepare(sql).bind(...params) : db().prepare(sql);
  const { results } = await stmt.all<T>();
  return results ?? [];
}

/** Run a query and return the first row, or null. */
export async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
