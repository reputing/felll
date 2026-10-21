// Mirrors the AniList anime catalog into Supabase.
//
//   npm run sync:catalog                  every title, oldest id first
//   npm run sync:catalog -- --pages 40    first 40 pages (1,000 most popular)
//   npm run sync:airing                   only currently airing titles (schedule)
//
// AniList allows ~90 requests/minute (30 while degraded); this paces itself
// and honours Retry-After on 429s. A full sync takes about 30 minutes.

import { adminClient, animeSlug, arg, flag, sleep } from "./lib";

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

function toRow(m: Media) {
  return {
    anilist_id: m.id,
    slug: animeSlug(m.title.english || m.title.romaji, m.id),
    mal_id: m.idMal,
    title_english: m.title.english,
    title_romaji: m.title.romaji,
    title_native: m.title.native,
    synonyms: m.synonyms ?? [],
    description: stripHtml(m.description),
    format: m.format,
    status: m.status,
    season: m.season,
    season_year: m.seasonYear,
    country_of_origin: m.countryOfOrigin,
    is_adult: m.isAdult,
    episodes_total: m.episodes,
    duration_minutes: m.duration,
    genres: m.genres ?? [],
    tags: m.tags.filter((t) => !t.isMediaSpoiler && t.rank >= 60).map((t) => t.name),
    studios: m.studios.nodes.map((s) => s.name),
    characters: m.characters.nodes.map((c) => c.name.full).filter(Boolean),
    staff: m.staff.nodes.map((s) => s.name.full).filter(Boolean),
    cover_url: m.coverImage.extraLarge,
    color: m.coverImage.color,
    banner_url: m.bannerImage,
    trailer_youtube_id: m.trailer?.site === "youtube" ? m.trailer.id : null,
    average_score: m.averageScore,
    popularity: m.popularity ?? 0,
    anilist_trending: m.trending ?? 0,
    next_episode: m.nextAiringEpisode?.episode ?? null,
    next_episode_at: m.nextAiringEpisode ? new Date(m.nextAiringEpisode.airingAt * 1000).toISOString() : null,
  };
}

async function main() {
  const db = adminClient();
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
      const { error } = await db.from("anime").upsert(media.map(toRow), { onConflict: "anilist_id" });
      if (error) throw error;
      total += media.length;
    }
    console.log(`page ${page}: ${media.length} titles (${total} total)`);
    if (!pageInfo.hasNextPage) break;
    // Stay under AniList's rate limit.
    await sleep(Math.max(0, 2100 - (Date.now() - started)));
  }

  if (airing) {
    // Titles that finished airing since the last run drop off the schedule.
    const { error } = await db
      .from("anime")
      .update({ next_episode: null, next_episode_at: null })
      .lt("next_episode_at", new Date().toISOString());
    if (error) throw error;
  }
  console.log(`Synced ${total} titles.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
