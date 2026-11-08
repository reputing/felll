import { Suspense } from "react";
import { getGenres, searchAnime } from "@/lib/jikan";
import { Filters } from "@/components/browse/filters";
import { PageHead } from "@/components/page-head";
import { Pager } from "@/components/pager";
import { PosterCard } from "@/components/poster-card";
import { GridSkeleton } from "@/components/grid-skeleton";
import Link from "next/link";
import { groupSeasons } from "@/lib/seasons";

export const metadata = { title: "Browse" };

type SP = Record<string, string | undefined>;

export default async function Browse({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const genres = await getGenres();
  const thisYear = new Date().getUTCFullYear();
  const years = Array.from({ length: 50 }, (_, i) => thisYear + 1 - i);
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="Cupcake / every anime" title="Browse" sub="Search every anime. Filters stack." />
      <Filters genres={genres.map((g) => g.name)} years={years} />
      <Suspense key={JSON.stringify(sp)} fallback={<GridSkeleton />}>
        <Results sp={sp} genres={genres} />
      </Suspense>
    </div>
  );
}

async function Results({ sp, genres }: { sp: SP; genres: { id: number; name: string }[] }) {
  const page = Math.max(1, Number(sp.page) || 1);
  const genre = genres.find((g) => g.name === sp.genre);
  const order = sp.order ?? (sp.q ? undefined : "members");
  const res = await searchAnime({
    q: sp.q,
    type: sp.type,
    status: sp.status,
    rating: sp.rating,
    genres: genre ? String(genre.id) : undefined,
    genreName: genre?.name ?? sp.genre,
    order_by: order,
    sort: order === "title" ? "asc" : order ? "desc" : undefined,
    start_date: sp.year ? `${sp.year}-01-01` : undefined,
    end_date: sp.year ? `${sp.year}-12-31` : undefined,
    page,
  }).catch(() => null);
  if (!res) return <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">The catalog isn’t answering right now. Try again in a moment.</p>;
  if (!res.items.length) return <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">Nothing matches that. Loosen a filter?</p>;
  const qs = (p: number) => { const n = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]); n.set("page", String(p)); return `/browse?${n}`; };
  // A search folds a show's seasons into one card with S1 S2 S3 buttons (the page of results is
  // what's grouped, so the count above is still every match). Filtered browsing stays as it was.
  const grouped = !!sp.q && sp.flat !== "1";
  const entries = grouped ? groupSeasons(res.items) : res.items.map((lead) => ({ lead, seasons: [] as { id: number; label: string; title: string }[] }));
  const withFlat = (v: string | null) => { const n = new URLSearchParams(Object.entries(sp).filter(([k, x]) => x && k !== "flat") as [string, string][]); if (v) n.set("flat", v); return `/browse?${n}`; };
  const flatHref = withFlat("1"), groupHref = withFlat(null);
  return (
    <>
      <div className="flex items-center gap-3 px-1 text-[13px] font-semibold text-plum-muted">
        <span>{res.total.toLocaleString()} results</span>
        {grouped && entries.some((e) => e.seasons.length > 1) && <span>· seasons of one show are together. <Link href={flatHref} className="font-bold text-frost-text hover:text-frost-deep">show every season separately</Link></span>}
        {sp.q && sp.flat === "1" && <Link href={groupHref} className="font-bold text-frost-text hover:text-frost-deep">group seasons</Link>}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
        {entries.map(({ lead, seasons }) => (
          <div key={lead.id} className="flex flex-col gap-1.5">
            <PosterCard a={lead} />
            {seasons.length > 1 && (
              <div className="flex flex-wrap gap-1 px-1">
                {seasons.map((s) => (
                  <Link key={s.id} href={`/anime/${s.id}`} title={s.title} className="h-6 rounded-full border-1.5 border-line bg-cream-card px-2.5 text-[11.5px] font-extrabold leading-[21px] hover:border-frost-hot hover:text-frost-text">{s.label}</Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <Pager page={page} last={res.lastPage} href={qs} />
    </>
  );
}
