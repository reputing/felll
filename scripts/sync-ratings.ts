// Fills anime.age_rating (G … Rx) from MyAnimeList through the Jikan API,
// which AniList does not provide.
//
//   npm run sync:ratings                 up to 500 titles still missing one
//   npm run sync:ratings -- --limit 5000
//
// Jikan allows 3 requests/second and 60/minute; this makes one per 1.1s.

import { arg, sleep } from "./lib";
import { d1Query } from "./d1";

const RATINGS: [RegExp, string][] = [
  [/^G\b/, "G"],
  [/^PG-13\b/, "PG-13"],
  [/^PG\b/, "PG"],
  [/^R\+/, "R+"],
  [/^R\b/, "R"],
  [/^Rx\b/, "Rx"],
];

async function main() {
  const limit = Number(arg("limit")) || 500;
  const rows = await d1Query<{ id: number; mal_id: number }>(
    "SELECT id, mal_id FROM anime WHERE age_rating IS NULL AND mal_id IS NOT NULL ORDER BY popularity DESC LIMIT ?",
    [limit],
  );

  let updated = 0;
  for (const row of rows) {
    await sleep(1100);
    const res = await fetch(`https://api.jikan.moe/v4/anime/${row.mal_id}`);
    if (res.status === 429) {
      await sleep(5000);
      continue;
    }
    if (!res.ok) continue;
    const rating: string | null = ((await res.json()) as { data?: { rating?: string } }).data?.rating ?? null;
    const value = rating && RATINGS.find(([re]) => re.test(rating))?.[1];
    if (!value) continue;
    await d1Query("UPDATE anime SET age_rating = ? WHERE id = ?", [value, row.id]);
    updated++;
  }
  console.log(`Updated ${updated} of ${rows.length} titles.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
