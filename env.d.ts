// Bindings and vars from wrangler.jsonc, plus the slice of the D1 API this app
// uses. Hand-written so a fresh clone typechecks without `wrangler types`.

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id: number; duration: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface CloudflareEnv {
  DB: D1Database;
  NEXT_PUBLIC_SITE_NAME?: string;
  /** kuro's sign-in hub, e.g. https://kuro.rip */
  KURO_URL?: string;
  /** kuro's Supabase project (profile lookups after sign-in) */
  KURO_SUPABASE_URL?: string;
  /** kuro's service-role key: signs SSO hand-off codes and reads profiles. Secret. */
  KURO_SERVICE_KEY?: string;
  /** "1" to admit kuro+ members only */
  REQUIRE_KURO_PLUS?: string;
  /** comma-separated kuro handles with admin rights on cupcake */
  ADMIN_HANDLES?: string;
  /** a self-hosted Jikan, if you run one */
  JIKAN_URL?: string;
  STREAM_CUSTOMER_DOMAIN?: string;
  STREAM_SIGNING_KEY_ID?: string;
  STREAM_SIGNING_KEY_JWK?: string;
}
