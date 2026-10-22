import { currentSeason, getGenres, getHome, getScheduleDay, getSeason, WEEKDAYS } from "@/lib/jikan";
import { run } from "@/lib/db";
import { runAiringCheck } from "@/lib/airing";

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
  await Promise.allSettled([
    run("delete from presence where updated_at < unixepoch() - 86400"),
    run("delete from sessions where expires_at < unixepoch()"),
    run("delete from sso_burned where expires_at < unixepoch()"),
    run("delete from jikan_cache where fetched_at < unixepoch() - 30 * 86400"),
    run("delete from daily_views where day < date('now', '-60 days')"),
  ]);
  return new Response("warm");
}
