import { currentUser } from "@/lib/auth";
import { first } from "@/lib/db";
import { lastJikanError, live } from "@/lib/jikan";

// Is MyAnimeList reachable from this Worker, and how much do we have stored?
// Members only. Open /api/health in the browser to see.
export async function GET() {
  if (!(await currentUser())) return Response.json({ error: "sign in first" }, { status: 401 });
  const t = Date.now();
  let jikan: { ok: boolean; ms: number; error?: string };
  try {
    await live("/genres/anime?filter=demographics", { force: true });
    jikan = { ok: true, ms: Date.now() - t };
  } catch (e) {
    jikan = { ok: false, ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
  }
  const stored = await first<{ catalog: number; cache: number; newest: number | null }>(
    "select (select count(*) from catalog) as catalog, (select count(*) from jikan_cache) as cache, (select max(updated_at) from catalog) as newest",
  ).catch(() => null);
  return Response.json(
    {
      jikan,
      lastJikanError,
      catalog: stored?.catalog ?? 0,
      cachedResponses: stored?.cache ?? 0,
      catalogUpdated: stored?.newest ? new Date(stored.newest * 1000).toISOString() : null,
      hint: stored?.catalog ? undefined : "Run `npm run sync` on your computer to fill the catalog.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
