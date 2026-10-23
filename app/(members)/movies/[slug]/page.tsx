import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, Star } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { movieDetail, movieEmbeds, movieSeasonEpisodes, moviesEnabled, type MovieMedia, type MovieSource, type MovieStream } from "@/lib/tmdb";
import { stream8Movie } from "@/lib/stream8";
import { Poster } from "@/components/poster";
import { MoviePlayer } from "@/components/movies/player";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ se?: string; ep?: string }> };

// Route key is `${media}-${tmdbId}`, e.g. movie-157336 or tv-1396.
function parseSlug(slug: string): { media: MovieMedia; id: number } | null {
  const m = /^(movie|tv)-(\d+)$/.exec(slug);
  return m ? { media: m[1] as MovieMedia, id: Number(m[2]) } : null;
}

export async function generateMetadata({ params }: Props) {
  const ref = parseSlug((await params).slug);
  const d = ref ? await movieDetail(ref.media, ref.id).catch(() => null) : null;
  return { title: d ? d.title : "Watch" };
}

export default async function MovieWatchPage({ params, searchParams }: Props) {
  const { slug } = await params;
  await requireMember(`/movies/${slug}`);
  if (!(await moviesEnabled())) redirect("/movies");

  const ref = parseSlug(slug);
  if (!ref) notFound();
  const d = await movieDetail(ref.media, ref.id);
  if (!d) notFound();

  const sp = await searchParams;
  const se = d.isSeries ? Number(sp.se) || d.seasons[0]?.season || 1 : undefined;
  const ep = d.isSeries ? Number(sp.ep) || 1 : undefined;

  // Movie HLS from 8Stream (keyed by IMDB id), plus the TMDB-keyed embed
  // servers; TV episodes rely on the embeds. Resolved together.
  const [stream8List, embeds, epList] = await Promise.all([
    d.media === "movie" ? stream8Movie(d.imdbId) : Promise.resolve([]),
    movieEmbeds(d.media, d.id, se, ep),
    d.isSeries && se ? movieSeasonEpisodes(d.id, se) : Promise.resolve([]),
  ]);
  const sources: MovieSource[] = stream8List.map((s) => ({ label: s.label, url: s.url, format: "hls" as const }));
  const stream: MovieStream | null = sources.length ? { sources, subtitles: [] } : null;

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <nav aria-label="breadcrumb" className="flex items-center gap-1.5 px-1 text-[12.5px] font-bold text-plum-muted">
        <Link href="/movies" className="hover:text-frost-text">Movies &amp; Series</Link>
        <ChevronRight className="size-3.5" /><span className="truncate text-frost-text">{d.title}</span>
      </nav>

      {stream || embeds.length ? <MoviePlayer stream={stream} embeds={embeds} poster={d.backdrop ?? d.poster} /> : (
        <div className="grid aspect-video w-full place-items-center rounded-[26px] border-1.5 border-night-line bg-night p-6 text-center text-night-muted">
          <div>
            <p className="text-[17px] font-extrabold text-night-text">Not streamable right now</p>
            <p className="mt-1 text-[13.5px]">No sources for this title yet{d.isSeries ? " for this episode" : ""}. Try another{d.isSeries ? " episode or " : " "}server.</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-box border-1.5 border-line bg-cream-card p-5">
        <div className="min-w-0">
          <div className="eyebrow">{d.media === "tv" ? "Series" : "Movie"}{d.year ? ` · ${d.year}` : ""}{se ? ` · S${se} E${ep}` : ""}</div>
          <h1 className="mt-1 text-balance text-[24px] font-extrabold leading-tight tracking-[-.8px]">{d.title}</h1>
          {d.rating && <div className="mt-1 flex items-center gap-1 text-[13px] font-bold text-plum-body"><Star className="size-3.5 text-sprinkle-star" fill="currentColor" />{d.rating}</div>}
          {d.genres.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{d.genres.slice(0, 6).map((g) => <span key={g} className="rounded-full border-1.5 border-line-soft bg-paper px-2.5 py-0.5 text-[11.5px] font-bold text-plum-muted">{g}</span>)}</div>}
          {d.overview && <p className="mt-3 max-w-prose text-[14px] leading-relaxed text-plum-body line-clamp-5">{d.overview}</p>}
        </div>
        <Poster src={d.poster} className="hidden aspect-[2/3] w-[120px] flex-none rounded-2xl border-1.5 border-line sm:block" />
      </div>

      {d.isSeries && d.seasons.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-[11px] font-extrabold uppercase tracking-[.12em] text-plum-muted">Season</span>
          {d.seasons.map((s) => (
            <Link key={s.season} href={`/movies/${slug}?se=${s.season}&ep=1`} scroll={false}
              className={cn("h-8 rounded-full border-1.5 border-line bg-cream-card px-3.5 text-[12.5px] font-extrabold hover:border-frost-hot", s.season === se && "border-frost-hot bg-frost text-frost-ink")}>
              {s.season}
            </Link>
          ))}
        </div>
      )}

      {d.isSeries && epList.length > 0 && (
        <section className="rounded-box border-1.5 border-line bg-cream-card p-5">
          <h2 className="mb-3 text-lg font-extrabold tracking-[-.4px]">Episodes · Season {se}</h2>
          <ol className="scrollbar-none grid max-h-[420px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {epList.map((e) => {
              const on = e.ep === ep;
              return (
                <li key={e.ep}>
                  <Link href={`/movies/${slug}?se=${e.se}&ep=${e.ep}`} scroll={false}
                    className={cn("grid grid-cols-[40px_1fr] items-center gap-3 rounded-2xl border-1.5 p-2 transition hover:border-frost-hot", on ? "border-frost-hot bg-cream-blush" : "border-line-soft bg-paper")}>
                    <span className="grid h-9 place-items-center rounded-lg bg-cream-tint font-mono text-[12.5px] text-frost-text">{e.ep}</span>
                    <span className="truncate text-[13.5px] font-extrabold">{e.title}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
