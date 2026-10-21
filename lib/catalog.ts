import { supabase } from "./supabase";
import type { Anime, AnimeCard, Episode, SearchFilters, Subtitle, VideoSource } from "./types";

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
