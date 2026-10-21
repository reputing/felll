// Fills anime.age_rating (G … Rx) from MyAnimeList through the Jikan API,
// which AniList does not provide.
//
//   npm run sync:ratings                 up to 500 titles still missing one
//   npm run sync:ratings -- --limit 5000
//
// Jikan allows 3 requests/second and 60/minute; this makes one per 1.1s.

import { adminClient, arg, sleep } from "./lib";

const RATINGS: [RegExp, string][] = [
  [/^G\b/, "G"],
  [/^PG-13\b/, "PG-13"],
  [/^PG\b/, "PG"],
  [/^R\+/, "R+"],
  [/^R\b/, "R"],
  [/^Rx\b/, "Rx"],
];

async function main() {
  const db = adminClient();
  const limit = Number(arg("limit")) || 500;
  const { data: rows, error } = await db
    .from("anime")
    .select("id, mal_id")
    .is("age_rating", null)
    .not("mal_id", "is", null)
    .order("popularity", { ascending: false })
    .limit(limit);
  if (error) throw error;

  let updated = 0;
  for (const row of rows ?? []) {
    await sleep(1100);
    const res = await fetch(`https://api.jikan.moe/v4/anime/${row.mal_id}`);
    if (res.status === 429) {
      await sleep(5000);
      continue;
    }
    if (!res.ok) continue;
    const rating: string | null = (await res.json()).data?.rating ?? null;
    const value = rating && RATINGS.find(([re]) => re.test(rating))?.[1];
    if (!value) continue;
    const { error: e } = await db.from("anime").update({ age_rating: value }).eq("id", row.id);
    if (e) throw e;
    updated++;
  }
  console.log(`Updated ${updated} of ${rows?.length ?? 0} titles.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
