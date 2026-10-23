import { requireMember } from "@/lib/auth";
import { moviesEnabled } from "@/lib/movies";
import { PageHead } from "@/components/page-head";
import { MovieBrowse } from "@/components/movies/browse";

export const metadata = { title: "Movies & Series" };

export default async function MoviesPage() {
  await requireMember("/movies");
  const on = await moviesEnabled();
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="Cupcake / watch" title="Movies &amp; Series" sub="Films and shows from across the catalog — not just anime." />
      {on ? (
        <MovieBrowse />
      ) : (
        <div className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center">
          <p className="text-xl font-extrabold text-frost-deep">Movies are warming up.</p>
          <p className="mt-2 text-plum-muted">This section lights up once the movie backend is connected. If you run cupcake, point <code className="rounded bg-cream-tint px-1.5 font-mono text-[12.5px] text-frost-text">MOVIEBOX_API_URL</code> at your Moviebox-API instance.</p>
        </div>
      )}
    </div>
  );
}
