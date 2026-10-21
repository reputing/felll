// Shared by server and client: the slice of an anime that library writes carry.
export interface AnimeRef {
  id: number;
  title: string;
  poster: string | null;
  episodes: number | null;
  format: string;
}

export const refOf = (a: { id: number; title: string; posterSm?: string | null; poster: string | null; episodes: number | null; format: string }): AnimeRef => ({
  id: a.id, title: a.title, poster: a.posterSm ?? a.poster, episodes: a.episodes, format: a.format,
});
