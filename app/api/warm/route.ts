import { getCloudflareContext } from "@opennextjs/cloudflare";
import { currentSeason, getGenres, getHome, getScheduleDay, getSeason, WEEKDAYS } from "@/lib/jikan";
import { run } from "@/lib/db";
import { runAiringCheck } from "@/lib/airing";
import { backfillAvatars } from "@/lib/kuro";

// Keep the weebcentral (comick-source-api) container warm so readers never pay a
// ~40s cold start (it sleeps after 30m; this cron runs every 20m).
async function warmWeeb() {
  try {
    const env = (await getCloudflareContext({ async: true })).env as unknown as { WEEB_API_URL?: string };
    const url = (env?.WEEB_API_URL || process.env.WEEB_API_URL || "").replace(/\/+$/, "");
    if (url) await fetch(`${url}/api/sources`, { signal: AbortSignal.timeout(25_000) });
  } catch {
    /* best effort */
  }
}

// Called by the cron in worker.ts (never reachable from outside: only the
// cron's internal request has this host). Touches the busiest Jikan lists so
// stale ones refresh, and sweeps old rows.
export async function GET(req: Request) {
  if (new URL(req.url).hostname !== "cupcake.internal") return new Response("not found", { status: 404 });
  const { year, season } = currentSeason();
  await getHome();
  await getSeason(year, season, 1);
  for (const d of WEEKDAYS) await getScheduleDay(d);
  await getGenres();
  await runAiringCheck().catch(() => {});
  await backfillAvatars().catch(() => {});
  await warmWeeb();
  await Promise.allSettled([
    run("delete from presence where updated_at < unixepoch() - 86400"),
    run("delete from sessions where expires_at < unixepoch()"),
    run("delete from sso_burned where expires_at < unixepoch()"),
    run("delete from jikan_cache where fetched_at < unixepoch() - 30 * 86400"),
    run("delete from daily_views where day < date('now', '-60 days')"),
    // keep the global chat to the most recent ~500 messages
    run("delete from chat_messages where id <= (select max(id) - 500 from chat_messages)"),
  ]);
  return new Response("warm");
}
