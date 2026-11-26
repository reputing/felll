import Link from "next/link";
import { Clock3, Library, Play, Star } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { movieCatalog, movieDetail } from "@/lib/tmdb";
import { continueWatching } from "@/lib/movie-user";
import { PageHead } from "@/components/page-head";
import { CATALOG } from "@/lib/catalog-size";
import { Button } from "@/components/ui/button";
import { MovieBrowse } from "@/components/movies/browse";
import { ContinueRail, Rail } from "@/components/movies/rail";
import { Poster } from "@/components/poster";

export const metadata = { title: "Movies & Series" };

// The movies hub: a featured title, what you were in the middle of, shelves to browse, then the full filterable catalogue.
export default async function MoviesPage({ searchParams }: { searchParams: Promise<{ genre?: string; q?: string }> }) {
  const me = await requireMember("/movies");
  const sp = await searchParams;
  const browsing = !!(sp.genre || sp.q);
  const [films, shows, top, fresh, cont] = await Promise.all([
    movieCatalog({ type: "movie", sort: "popular" }),
    movieCatalog({ type: "tv", sort: "popular" }),
    movieCatalog({ type: "all", sort: "rating" }),
    movieCatalog({ type: "all", sort: "recent" }),
    continueWatching(me.id),
  ]);
  // the featured title rotates by the hour among the five most popular, so the page is not the same every visit
  const pool = [...films.items.slice(0, 3), ...shows.items.slice(0, 2)];
  const pick = pool.length ? pool[Math.floor(Date.now() / 3_600_000) % pool.length] : null;
  const hero = pick ? await movieDetail(pick.media, pick.id).catch(() => null) : null;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-3 pb-14 pt-4 sm:px-5">
      <PageHead eyebrow="Cupcake / watch" title="Movies &amp; Series" sub={`${CATALOG.all} films and series, from the blockbusters to the obscure.`}>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link href="/movies/list"><Library className="size-4" />My list</Link></Button>
          <Button variant="outline" asChild><Link href="/movies/history"><Clock3 className="size-4" />History</Link></Button>
        </div>
      </PageHead>

      {!browsing && hero && (
        <Link href={`/movies/${hero.slug}`} className="group relative isolate block min-h-[340px] overflow-hidden rounded-[28px] border-1.5 border-line bg-night">
          {hero.backdrop && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.backdrop} alt="" referrerPolicy="no-referrer" className="absolute inset-0 -z-10 size-full object-cover opacity-70 transition duration-700 group-hover:scale-[1.03]" />
          )}
          <span className="absolute inset-0 -z-10 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
          <span className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="flex min-h-[340px] max-w-[620px] flex-col justify-end gap-3 p-6 sm:p-9">
            <span className="eyebrow text-white/70">Featured · {hero.media === "tv" ? "Series" : "Film"}{hero.year ? ` · ${hero.year}` : ""}</span>
            <h2 className="text-balance text-[clamp(28px,4vw,46px)] font-extrabold leading-[1.02] tracking-[-1.4px] text-white">{hero.title}</h2>
            <div className="flex flex-wrap items-center gap-3 text-[13px] font-bold text-white/85">
              {hero.rating && <span className="flex items-center gap-1"><Star className="size-3.5 text-sprinkle-star" fill="currentColor" />{hero.rating}</span>}
              {hero.runtime && <span>{hero.runtime}</span>}
              {hero.genres.slice(0, 3).map((g) => <span key={g} className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11.5px] backdrop-blur">{g}</span>)}
            </div>
            {hero.overview && <p className="line-clamp-3 max-w-[52ch] text-[14px] leading-relaxed text-white/80">{hero.overview}</p>}
            <span className="mt-1 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-frost px-6 text-[14px] font-extrabold text-frost-ink shadow-[0_10px_30px_-10px_rgb(var(--glow)/.8)]"><Play className="size-4" fill="currentColor" />Watch now</span>
          </div>
        </Link>
      )}

      {!browsing && <ContinueRail items={cont} />}
      {!browsing && (
        <>
          <Rail eyebrow="Right now" title="Popular films" items={films.items.slice(0, 20)} />
          <Rail eyebrow="Binge-worthy" title="Popular series" items={shows.items.slice(0, 20)} />
          <Rail eyebrow="Loved by critics" title="Top rated" items={top.items.slice(0, 20)} />
          <Rail eyebrow="Just out" title="New this year" items={fresh.items.slice(0, 20)} />
        </>
      )}

      <section className="flex flex-col gap-3" id="browse">
        <div className="px-1"><div className="eyebrow">Find something · {CATALOG.all} titles</div><h2 className="mt-0.5 text-xl font-extrabold tracking-[-.6px]">{browsing ? "Browse" : "Browse everything"}</h2></div>
        <MovieBrowse initialGenre={sp.genre ?? ""} initialQuery={sp.q ?? ""} />
      </section>
    </div>
  );
}
