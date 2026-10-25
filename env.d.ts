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

// Minimal Durable Object + WebSocket types for the live chat room (hand-written,
// like the D1 slice above, so a fresh clone typechecks without wrangler types).
interface DurableObjectId { toString(): string }
interface DurableObjectStub { fetch(request: Request): Promise<Response> }
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectState {
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
}
// Cloudflare extends the DOM WebSocket with these (declaration merging):
interface WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
interface ResponseInit { webSocket?: WebSocket | null }
declare const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket } };

declare module "cloudflare:workers" {
  export class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
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
  /** The Anivexa aggregator ("the bot") for anime streams */
  ANIVEXA_API_URL?: string;
  /** A self-hosted Consumet manga API (a Cloudflare Container) — the second
   *  English source, used only when MangaDex has no English for a title. Unset
   *  = disabled, manga falls back to MangaDex. */
  CONSUMET_API_URL?: string;
  /** TMDB v3 API key — powers the movies & series catalog and embed players */
  TMDB_API_KEY?: string;
  /** A self-hosted 8Stream API (github.com/himanshu8443/8StreamApi) for movie HLS */
  STREAM8_API_URL?: string;
  /** Override the VidCore embed host (it moves) */
  VIDCORE_EMBED_BASE?: string;
  /** The global chat room Durable Object (live WebSocket fan-out) */
  CHAT: DurableObjectNamespace;
}
