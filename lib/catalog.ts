import { anivexaEnabled, fetchAnivexaCatalog, type AnivexaProviderSummary } from "./anivexa";
import { supabase } from "./supabase";
import type { Anime, AnimeCard, Episode, PlayerSource, SearchFilters, Subtitle, VideoSource, WatchEpisode } from "./types";

export async function searchAnime(f: SearchFilters): Promise<{ results: AnimeCard[]; total: number }> {
  const { data, error } = await supabase().rpc("search_anime", {
    q: f.q || null,
    p_genres: f.genres?.length ? f.genres : null,
    p_tags: f.tags?.length ? f.tags : null,
    p_year: f.year ?? null,
    p_season: f.season ?? null,
    p_format: f.format ?? null,
    p_status: f.status ?? null,
    p_origin: f.origin ?? null,
    p_audio: f.audio ?? null,
    p_rating: f.rating ?? null,
    p_studio: f.studio || null,
    p_character: f.character || null,
    p_staff: f.staff || null,
    p_sort: f.sort || null,
    p_page: f.page ?? 1,
    p_page_size: f.pageSize ?? 24,
  });
  if (error) throw error;
  const results = (data ?? []) as AnimeCard[];
  return { results, total: results[0]?.total_count ?? 0 };
}

export async function getFilterValues(): Promise<{ genres: string[]; tags: string[]; years: number[] }> {
  const { data, error } = await supabase().rpc("list_filter_values");
  if (error) throw error;
  return data;
}

export async function getAnime(slug: string): Promise<Anime | null> {
  const { data, error } = await supabase().from("anime").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getEpisodes(animeId: number): Promise<Episode[]> {
  const { data, error } = await supabase()
    .from("episodes")
    .select("*")
    .eq("anime_id", animeId)
    .order("number");
  if (error) throw error;
  return data ?? [];
}

export async function getSources(episodeId: number): Promise<VideoSource[]> {
  const { data, error } = await supabase()
    .from("video_sources")
    .select("id, episode_id, provider, label, audio, priority")
    .eq("episode_id", episodeId)
    .order("priority");
  if (error) throw error;
  return data ?? [];
}

export async function getSubtitles(episodeId: number): Promise<Subtitle[]> {
  const { data, error } = await supabase().from("subtitles").select("*").eq("episode_id", episodeId);
  if (error) throw error;
  return data ?? [];
}

export async function getEpisodeAudioMap(animeId: number): Promise<Record<number, { sub: boolean; dub: boolean }>> {
  const { data, error } = await supabase()
    .from("video_sources")
    .select("episode_id, audio, episodes!inner(anime_id)")
    .eq("episodes.anime_id", animeId);
  if (error) throw error;
  const map: Record<number, { sub: boolean; dub: boolean }> = {};
  for (const row of data ?? []) {
    const epId = row.episode_id as number;
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
  const { data, error } = await supabase().rpc("airing_schedule", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw error;
  return (data ?? []) as {
    id: number;
    slug: string;
    title_english: string | null;
    title_romaji: string;
    cover_url: string | null;
    next_episode: number;
    next_episode_at: string;
  }[];
}
