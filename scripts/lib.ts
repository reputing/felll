// Scripts read .env.local / .env like Next.js does; variables already set in
// the environment (e.g. CI secrets) win.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // File absent.
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

/**
 * Runs SQL against the site's D1 database through Cloudflare's API, the same
 * database the Worker uses. Needs CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID and a
 * CLOUDFLARE_API_TOKEN with "D1: Edit".
 */
export async function d1<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${requireEnv("CLOUDFLARE_ACCOUNT_ID")}/d1/database/${requireEnv("D1_DATABASE_ID")}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${requireEnv("CLOUDFLARE_API_TOKEN")}`, "content-type": "application/json" },
      body: JSON.stringify({ sql, params }),
    },
  );
  const body = (await res.json()) as { success: boolean; errors?: unknown; result?: { results: T[] }[] };
  if (!body.success) throw new Error(`D1: ${JSON.stringify(body.errors)}`);
  return body.result?.[0]?.results ?? [];
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

export const flag = (name: string) => process.argv.includes(`--${name}`);

/**
 * The MyAnimeList id in "52991", "mal-52991", "mal:52991",
 * "52991-frieren" (folder names) or a cupcake / MAL url.
 */
export function malIdOf(ref: string): number | null {
  const m = ref.match(/(?:^|\/anime\/|^mal[:-])(\d{1,7})(?:$|[-/?#\s])/i);
  return m ? Number(m[1]) : null;
}

/** The anime's title from Jikan, for friendlier logs (null if Jikan is down). */
export async function titleOf(malId: number): Promise<string | null> {
  try {
    const r = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { title_english?: string; title?: string } };
    return j.data?.title_english || j.data?.title || null;
  } catch {
    return null;
  }
}
