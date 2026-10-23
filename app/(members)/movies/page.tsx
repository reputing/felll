import { requireMember } from "@/lib/auth";
import { moviesEnabled } from "@/lib/tmdb";
import { PageHead } from "@/components/page-head";
import { MovieBrowse } from "@/components/movies/browse";
import { MoviesComingSoon } from "@/components/movies/coming-soon";

export const metadata = { title: "Movies & Series" };

// Movies run on TMDB (catalog) + 8Stream (movie HLS) + embed servers. When
// TMDB_API_KEY isn't set the section shows its blurred "coming soon" state.
export default async function MoviesPage() {
  await requireMember("/movies");
  const on = await moviesEnabled();
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="Cupcake / watch" title="Movies &amp; Series" sub="Films and shows from across the catalog, not just anime." />
      {on ? <MovieBrowse /> : <MoviesComingSoon />}
    </div>
  );
}
