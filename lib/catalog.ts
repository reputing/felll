import { anivexaEnabled, fetchAnivexaCatalog, type AnivexaProviderSummary } from "./anivexa";
import { query, queryOne } from "./db";
import type { Anime, AnimeCard, Episode, PlayerSource, SearchFilters, Subtitle, VideoSource, WatchEpisode } from "./types";

// --- row mappers -----------------------------------------------------------

function arr(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value !== "string" || value === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const bool = (v: unknown): boolean => v === 1 || v === true || v === "1";
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

function mapCard(r: Record<string, unknown>): AnimeCard {
  return {
    id: Number(r.id),
    slug: String(r.slug),
    title_english: (r.title_english as string) ?? null,
    title_romaji: String(r.title_romaji),
    format: (r.format as AnimeCard["format"]) ?? null,
    status: (r.status as AnimeCard["status"]) ?? null,
    season_year: numOrNull(r.season_year),
    age_rating: (r.age_rating as string) ?? null,
    episodes_total: numOrNull(r.episodes_total),
    duration_minutes: numOrNull(r.duration_minutes),
    genres: arr(r.genres),
    cover_url: (r.cover_url as string) ?? null,
    color: (r.color as string) ?? null,
    average_score: numOrNull(r.average_score),
    popularity: Number(r.popularity ?? 0),
    sub_episodes: Number(r.sub_episodes ?? 0),
    dub_episodes: Number(r.dub_episodes ?? 0),
    rank: Number(r.rank ?? 0),
    total_count: Number(r.total_count ?? 0),
  };
}

function mapAnime(r: Record<string, unknown>): Anime {
  return {
    id: Number(r.id),
    slug: String(r.slug),
    anilist_id: numOrNull(r.anilist_id),
    mal_id: numOrNull(r.mal_id),
    title_english: (r.title_english as string) ?? null,
    title_romaji: String(r.title_romaji),
    title_native: (r.title_native as string) ?? null,
    synonyms: arr(r.synonyms),
    description: (r.description as string) ?? null,
    format: (r.format as Anime["format"]) ?? null,
    status: (r.status as Anime["status"]) ?? null,
    season: (r.season as Anime["season"]) ?? null,
    season_year: numOrNull(r.season_year),
    country_of_origin: (r.country_of_origin as string) ?? null,
    age_rating: (r.age_rating as string) ?? null,
    episodes_total: numOrNull(r.episodes_total),
    duration_minutes: numOrNull(r.duration_minutes),
    genres: arr(r.genres),
    tags: arr(r.tags),
    studios: arr(r.studios),
    characters: arr(r.characters),
    staff: arr(r.staff),
    cover_url: (r.cover_url as string) ?? null,
    banner_url: (r.banner_url as string) ?? null,
    color: (r.color as string) ?? null,
    trailer_youtube_id: (r.trailer_youtube_id as string) ?? null,
    average_score: numOrNull(r.average_score),
    popularity: Number(r.popularity ?? 0),
    next_episode: numOrNull(r.next_episode),
    next_episode_at: (r.next_episode_at as string) ?? null,
    sub_episodes: Number(r.sub_episodes ?? 0),
    dub_episodes: Number(r.dub_episodes ?? 0),
  };
}

function mapEpisode(r: Record<string, unknown>): Episode {
  return {
    id: Number(r.id),
    anime_id: Number(r.anime_id),
    number: Number(r.number),
    title: (r.title as string) ?? null,
    synopsis: (r.synopsis as string) ?? null,
    thumbnail_url: (r.thumbnail_url as string) ?? null,
    duration_seconds: numOrNull(r.duration_seconds),
    intro_start: numOrNull(r.intro_start),
    intro_end: numOrNull(r.intro_end),
    outro_start: numOrNull(r.outro_start),
    is_filler: bool(r.is_filler),
  };
}

// --- search ----------------------------------------------------------------

const CARD_COLUMNS = `a.id, a.slug, a.title_english, a.title_romaji, a.format, a.status,
  a.season_year, a.age_rating, a.episodes_total, a.duration_minutes, a.genres,
  a.cover_url, a.color, a.average_score, a.popularity, a.sub_episodes, a.dub_episodes`;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** FTS5 trigram match string for a term (quoted so punctuation can't break syntax). */
function ftsMatch(term: string): string {
  return `"${term.replace(/"/g, '""')}"`;
}

export async function searchAnime(f: SearchFilters): Promise<{ results: AnimeCard[]; total: number }> {
  const selectParams: unknown[] = [];
  const whereParams: unknown[] = [];
  const where: string[] = ["a.is_published = 1", "a.is_adult = 0"];

  const term = f.q?.trim().toLowerCase() || "";
  const hasTerm = term.length > 0;

  // Relevance: prefix match ranks highest, then any substring. Added in the
  // SELECT list, so these params come first.
  let rankExpr = "0";
  if (hasTerm) {
    rankExpr = "(CASE WHEN a.search_titles LIKE ? THEN 2 WHEN a.search_titles LIKE ? THEN 1 ELSE 0 END)";
    selectParams.push(`${term}%`, `%${term}%`);
  }

  if (hasTerm) {
    if (term.length >= 3) {
      where.push("(a.id IN (SELECT rowid FROM anime_fts WHERE anime_fts MATCH ?) OR a.search_titles LIKE ?)");
      whereParams.push(ftsMatch(term), `%${term}%`);
    } else {
      where.push("a.search_titles LIKE ?");
      whereParams.push(`%${term}%`);
    }
  }

  for (const g of f.genres ?? []) {
    where.push("EXISTS (SELECT 1 FROM json_each(a.genres) j WHERE j.value = ?)");
    whereParams.push(g);
  }
  for (const t of f.tags ?? []) {
    where.push("EXISTS (SELECT 1 FROM json_each(a.tags) j WHERE j.value = ?)");
    whereParams.push(t);
  }
  if (f.year != null) {
    where.push("a.season_year = ?");
    whereParams.push(f.year);
  }
  if (f.season) {
    where.push("a.season = ?");
    whereParams.push(f.season);
  }
  if (f.format) {
    where.push("a.format = ?");
    whereParams.push(f.format);
  }
  if (f.status) {
    where.push("a.status = ?");
    whereParams.push(f.status);
  }
  if (f.origin) {
    where.push("a.country_of_origin = ?");
    whereParams.push(f.origin);
  }
  if (f.rating) {
    where.push("a.age_rating = ?");
    whereParams.push(f.rating);
  }
  if (f.audio === "sub") where.push("a.sub_episodes > 0");
  else if (f.audio === "dub") where.push("a.dub_episodes > 0");
  else if (f.audio === "both") where.push("a.sub_episodes > 0 AND a.dub_episodes > 0");

  if (f.studio) {
    where.push("EXISTS (SELECT 1 FROM json_each(a.studios) j WHERE lower(j.value) LIKE ?)");
    whereParams.push(`${f.studio.toLowerCase()}%`);
  }
  if (f.character) {
    where.push("EXISTS (SELECT 1 FROM json_each(a.characters) j WHERE lower(j.value) LIKE ?)");
    whereParams.push(`%${f.character.toLowerCase()}%`);
  }
  if (f.staff) {
    where.push("EXISTS (SELECT 1 FROM json_each(a.staff) j WHERE lower(j.value) LIKE ?)");
    whereParams.push(`%${f.staff.toLowerCase()}%`);
  }

  const trendingScore =
    "(COALESCE((SELECT SUM(v.views) FROM anime_daily_views v WHERE v.anime_id = a.id AND v.day > date('now','-14 day')), 0) * 10 + a.anilist_trending)";

  const sort = f.sort || (hasTerm ? "relevance" : "popularity");
  const ORDER: Record<string, string> = {
    trending: `${trendingScore} DESC, a.popularity DESC, a.id`,
    popularity: "a.popularity DESC, a.id",
    score: "a.average_score DESC, a.popularity DESC, a.id",
    year: "a.season_year DESC, a.popularity DESC, a.id",
    updated: "a.latest_episode_at DESC, a.popularity DESC, a.id",
    title: "COALESCE(a.title_english, a.title_romaji) COLLATE NOCASE ASC, a.id",
    relevance: "rank DESC, a.popularity DESC, a.id",
  };
  const orderBy = ORDER[sort] ?? ORDER.relevance;

  const pageSize = clamp(f.pageSize ?? 24, 1, 100);
  const offset = (Math.max(f.page ?? 1, 1) - 1) * pageSize;

  const sql = `
    SELECT ${CARD_COLUMNS},
           ${rankExpr} AS rank,
           COUNT(*) OVER () AS total_count
    FROM anime a
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?`;

  const rows = await query(sql, [...selectParams, ...whereParams, pageSize, offset]);
  const results = rows.map(mapCard);
  return { results, total: results[0]?.total_count ?? 0 };
}

export async function getFilterValues(): Promise<{ genres: string[]; tags: string[]; years: number[] }> {
  const [genres, tags, years] = await Promise.all([
    query<{ value: string }>(
      "SELECT DISTINCT j.value AS value FROM anime a, json_each(a.genres) j WHERE a.is_published = 1 AND a.is_adult = 0 ORDER BY j.value",
    ),
    query<{ value: string }>(
      "SELECT DISTINCT j.value AS value FROM anime a, json_each(a.tags) j WHERE a.is_published = 1 AND a.is_adult = 0 ORDER BY j.value",
    ),
    query<{ y: number }>(
      "SELECT DISTINCT season_year AS y FROM anime WHERE season_year IS NOT NULL AND is_published = 1 ORDER BY y DESC",
    ),
  ]);
  return { genres: genres.map((r) => r.value), tags: tags.map((r) => r.value), years: years.map((r) => Number(r.y)) };
}

export async function getAnime(slug: string): Promise<Anime | null> {
  const row = await queryOne("SELECT * FROM anime WHERE slug = ? AND is_published = 1", [slug]);
  return row ? mapAnime(row) : null;
}

export async function getEpisodes(animeId: number): Promise<Episode[]> {
  const rows = await query(
    "SELECT * FROM episodes WHERE anime_id = ? AND is_published = 1 ORDER BY number",
    [animeId],
  );
  return rows.map(mapEpisode);
}

export async function getSources(episodeId: number): Promise<VideoSource[]> {
  const rows = await query<Record<string, unknown>>(
    "SELECT id, episode_id, provider, label, audio, priority FROM video_sources WHERE episode_id = ? AND status = 'ready' ORDER BY priority",
    [episodeId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    episode_id: Number(r.episode_id),
    provider: r.provider as VideoSource["provider"],
    label: String(r.label),
    audio: r.audio as VideoSource["audio"],
    priority: Number(r.priority),
  }));
}

export async function getSubtitles(episodeId: number): Promise<Subtitle[]> {
  const rows = await query<Record<string, unknown>>("SELECT * FROM subtitles WHERE episode_id = ?", [episodeId]);
  return rows.map((r) => ({
    id: Number(r.id),
    episode_id: Number(r.episode_id),
    language: String(r.language),
    label: String(r.label),
    url: String(r.url),
    is_default: bool(r.is_default),
  }));
}

export async function getEpisodeAudioMap(animeId: number): Promise<Record<number, { sub: boolean; dub: boolean }>> {
  const rows = await query<{ episode_id: number; audio: string }>(
    `SELECT s.episode_id AS episode_id, s.audio AS audio
     FROM video_sources s JOIN episodes e ON e.id = s.episode_id
     WHERE e.anime_id = ? AND e.is_published = 1 AND s.status = 'ready'`,
    [animeId],
  );
  const map: Record<number, { sub: boolean; dub: boolean }> = {};
  for (const row of rows) {
    const epId = Number(row.episode_id);
    map[epId] ??= { sub: false, dub: false };
    if (row.audio === "sub" || row.audio === "raw") map[epId].sub = true;
    if (row.audio === "dub") map[epId].dub = true;
  }
  return map;
}

/**
 * The unified episode list for an anime: self-hosted episodes merged with the
 * episodes Anivexa can resolve from the anime's AniList ID. Returns the Anivexa
 * provider summaries too, so the caller can build external player sources.
 */
export async function getWatchEpisodes(
  anime: Anime,
): Promise<{ episodes: WatchEpisode[]; providers: AnivexaProviderSummary[] }> {
  const [local, audioByEpId, catalog] = await Promise.all([
    getEpisodes(anime.id),
    getEpisodeAudioMap(anime.id),
    anime.anilist_id != null && anivexaEnabled()
      ? fetchAnivexaCatalog(anime.anilist_id)
      : Promise.resolve(null),
  ]);

  const map = new Map<number, WatchEpisode>();
  for (const e of local) {
    const audio = audioByEpId[e.id] ?? { sub: false, dub: false };
    map.set(e.number, {
      number: e.number,
      title: e.title,
      thumbnail_url: e.thumbnail_url,
      synopsis: e.synopsis,
      filler: e.is_filler,
      localId: e.id,
      intro_start: e.intro_start,
      intro_end: e.intro_end,
      outro_start: e.outro_start,
      sub: audio.sub,
      dub: audio.dub,
    });
  }

  for (const ce of catalog?.episodes ?? []) {
    const existing = map.get(ce.number);
    if (existing) {
      existing.sub ||= ce.sub;
      existing.dub ||= ce.dub;
      existing.title ??= ce.title;
      existing.thumbnail_url ??= ce.thumbnail_url;
      existing.synopsis ??= ce.synopsis;
      existing.filler ||= ce.filler;
    } else {
      map.set(ce.number, {
        number: ce.number,
        title: ce.title,
        thumbnail_url: ce.thumbnail_url,
        synopsis: ce.synopsis,
        filler: ce.filler,
        localId: null,
        intro_start: null,
        intro_end: null,
        outro_start: null,
        sub: ce.sub,
        dub: ce.dub,
      });
    }
  }

  const episodes = [...map.values()].sort((a, b) => a.number - b.number);
  return { episodes, providers: catalog?.providers ?? [] };
}

/**
 * The player sources for one episode: self-hosted "servers" first (preferred),
 * then one entry per Anivexa provider that carries this episode's sub/dub.
 * Subtitles are the self-hosted ones; Anivexa subtitles arrive with the stream.
 */
export async function getWatchSources(
  anime: Anime,
  episode: WatchEpisode,
  providers: AnivexaProviderSummary[],
): Promise<{ sources: PlayerSource[]; subtitles: Subtitle[] }> {
  const [local, subtitles] = episode.localId
    ? await Promise.all([getSources(episode.localId), getSubtitles(episode.localId)])
    : [[], []];

  const sources: PlayerSource[] = local.map((s) => ({
    kind: "local",
    group: "local",
    sourceId: s.id,
    key: `local-${s.id}`,
    label: s.label,
    audio: s.audio,
  }));

  if (anime.anilist_id != null) {
    const anilistId = anime.anilist_id;
    for (const p of providers) {
      if (p.sub.includes(episode.number)) {
        sources.push({
          kind: "anivexa",
          group: "external",
          provider: p.slug,
          anilistId,
          episode: episode.number,
          key: `anivexa-${p.slug}-sub`,
          label: p.name,
          audio: "sub",
        });
      }
      if (p.dub.includes(episode.number)) {
        sources.push({
          kind: "anivexa",
          group: "external",
          provider: p.slug,
          anilistId,
          episode: episode.number,
          key: `anivexa-${p.slug}-dub`,
          label: p.name,
          audio: "dub",
        });
      }
    }
  }

  return { sources, subtitles };
}

export async function getSchedule(from: Date, to: Date) {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, slug, title_english, title_romaji, cover_url, next_episode, next_episode_at
     FROM anime
     WHERE is_published = 1 AND is_adult = 0 AND next_episode_at >= ? AND next_episode_at < ?
     ORDER BY next_episode_at`,
    [from.toISOString(), to.toISOString()],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    slug: String(r.slug),
    title_english: (r.title_english as string) ?? null,
    title_romaji: String(r.title_romaji),
    cover_url: (r.cover_url as string) ?? null,
    next_episode: Number(r.next_episode),
    next_episode_at: String(r.next_episode_at),
  }));
}
