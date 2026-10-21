// Mirrors the AniList anime catalog into Cloudflare D1.
//
//   npm run sync:catalog                  every title, oldest id first
//   npm run sync:catalog -- --pages 40    first 40 pages (1,000 most popular)
//   npm run sync:airing                   only currently airing titles (schedule)
//
// AniList allows ~90 requests/minute (30 while degraded); this paces itself
// and honours Retry-After on 429s. A full sync takes about 30 minutes.
// Writes go through the D1 HTTP API (see scripts/d1.ts for the env it needs).

import { animeSlug, arg, flag, sleep } from "./lib";
import { d1Query, mapLimit } from "./d1";

const ENDPOINT = "https://graphql.anilist.co";
const PER_PAGE = 25;

const QUERY = /* GraphQL */ `
  query ($page: Int, $perPage: Int, $sort: [MediaSort], $status: MediaStatus) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(type: ANIME, sort: $sort, status: $status) {
        id idMal
        title { romaji english native }
        synonyms
        description(asHtml: false)
        format status season seasonYear countryOfOrigin isAdult
        episodes duration genres
        tags { name rank isMediaSpoiler }
        studios(isMain: true) { nodes { name } }
        characters(perPage: 10, sort: [ROLE, RELEVANCE]) { nodes { name { full } } }
        staff(perPage: 8, sort: [RELEVANCE]) { nodes { name { full } } }
        coverImage { extraLarge color }
        bannerImage
        trailer { id site }
        averageScore popularity trending
        nextAiringEpisode { episode airingAt }
      }
    }
  }
`;

interface Media {
  id: number;
  idMal: number | null;
  title: { romaji: string; english: string | null; native: string | null };
  synonyms: string[];
  description: string | null;
  format: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  countryOfOrigin: string | null;
  isAdult: boolean;
  episodes: number | null;
  duration: number | null;
  genres: string[];
  tags: { name: string; rank: number; isMediaSpoiler: boolean }[];
  studios: { nodes: { name: string }[] };
  characters: { nodes: { name: { full: string } }[] };
  staff: { nodes: { name: { full: string } }[] };
  coverImage: { extraLarge: string | null; color: string | null };
  bannerImage: string | null;
  trailer: { id: string; site: string } | null;
  averageScore: number | null;
  popularity: number | null;
  trending: number | null;
  nextAiringEpisode: { episode: number; airingAt: number } | null;
}

async function fetchPage(page: number, variables: Record<string, unknown>) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { page, perPage: PER_PAGE, ...variables } }),
    });
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get("retry-after")) || 10 * attempt;
      console.warn(`AniList ${res.status}; retrying page ${page} in ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }
    const body = await res.json();
    if (body.errors) throw new Error(JSON.stringify(body.errors));
    return body.data.Page as { pageInfo: { hasNextPage: boolean }; media: Media[] };
  }
}

const stripHtml = (s: string | null) =>
  s?.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim() || null;

// Columns written per title, in the order the upsert binds them.
const COLUMNS = [
  "slug", "anilist_id", "mal_id", "title_english", "title_romaji", "title_native",
  "synonyms", "description", "format", "status", "season", "season_year",
  "country_of_origin", "is_adult", "episodes_total", "duration_minutes",
  "genres", "tags", "studios", "characters", "staff", "cover_url", "banner_url",
  "color", "trailer_youtube_id", "average_score", "popularity", "anilist_trending",
  "next_episode", "next_episode_at", "search_titles",
] as const;

const UPSERT_SQL = `
  INSERT INTO anime (${COLUMNS.join(", ")})
  VALUES (${COLUMNS.map(() => "?").join(", ")})
  ON CONFLICT (anilist_id) DO UPDATE SET
    ${COLUMNS.filter((c) => c !== "anilist_id").map((c) => `${c} = excluded.${c}`).join(", ")},
    updated_at = datetime('now')`;

function toParams(m: Media): unknown[] {
  const synonyms = m.synonyms ?? [];
  const searchTitles = [m.title.english, m.title.romaji, m.title.native, ...synonyms]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return [
    animeSlug(m.title.english || m.title.romaji, m.id),
    m.id,
    m.idMal,
    m.title.english,
    m.title.romaji,
    m.title.native,
    JSON.stringify(synonyms),
    stripHtml(m.description),
    m.format,
    m.status,
    m.season,
    m.seasonYear,
    m.countryOfOrigin,
    m.isAdult ? 1 : 0,
    m.episodes,
    m.duration,
    JSON.stringify(m.genres ?? []),
    JSON.stringify(m.tags.filter((t) => !t.isMediaSpoiler && t.rank >= 60).map((t) => t.name)),
    JSON.stringify(m.studios.nodes.map((s) => s.name)),
    JSON.stringify(m.characters.nodes.map((c) => c.name.full).filter(Boolean)),
    JSON.stringify(m.staff.nodes.map((s) => s.name.full).filter(Boolean)),
    m.coverImage.extraLarge,
    m.bannerImage,
    m.coverImage.color,
    m.trailer?.site === "youtube" ? m.trailer.id : null,
    m.averageScore,
    m.popularity ?? 0,
    m.trending ?? 0,
    m.nextAiringEpisode?.episode ?? null,
    m.nextAiringEpisode ? new Date(m.nextAiringEpisode.airingAt * 1000).toISOString() : null,
    searchTitles,
  ];
}

async function main() {
  const airing = flag("airing");
  const maxPages = Number(arg("pages")) || Infinity;
  const variables = airing
    ? { sort: ["POPULARITY_DESC"], status: "RELEASING" }
    : { sort: [arg("sort") ?? (Number.isFinite(maxPages) ? "POPULARITY_DESC" : "ID")] };

  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    const started = Date.now();
    const { media, pageInfo } = await fetchPage(page, variables);
    if (media.length) {
      // One upsert per title (D1 caps bound params at 100), run a few at a time.
      await mapLimit(media, 8, (m) => d1Query(UPSERT_SQL, toParams(m)));
      total += media.length;
    }
    console.log(`page ${page}: ${media.length} titles (${total} total)`);
    if (!pageInfo.hasNextPage) break;
    // Stay under AniList's rate limit.
    await sleep(Math.max(0, 2100 - (Date.now() - started)));
  }

  if (airing) {
    // Titles that finished airing since the last run drop off the schedule.
    await d1Query("UPDATE anime SET next_episode = NULL, next_episode_at = NULL WHERE next_episode_at < ?", [
      new Date().toISOString(),
    ]);
  }
  console.log(`Synced ${total} titles.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
