import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Star } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { movieDetail, movieStream } from "@/lib/movies";
import { Poster } from "@/components/poster";
import { MoviePlayer } from "@/components/movies/player";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ se?: string; ep?: string; sid?: string; t?: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const d = await movieDetail(slug).catch(() => null);
  // The stream CDN 403s a foreign Referer, so tell the browser to send none —
  // the signed URL then plays direct off the viewer's own connection. See
  // movieStream() in lib/movies.ts.
  return { title: d ? d.title : "Watch", referrer: "no-referrer" as const };
}

export default async function MovieWatchPage({ params, searchParams }: Props) {
  const { slug } = await params;
  await requireMember(`/movies/${slug}`);
  const d = await movieDetail(slug);
  if (!d) notFound();

  const sp = await searchParams;
  // The browse card carries the correct subject id + title; prefer them over the
  // detail parse so streaming and the heading are right even if /detail is thin.
  const subjectId = (sp.sid || d.id || "").trim();
  const title = d.title && d.title !== "Untitled" ? d.title : sp.t || d.title || "Untitled";
  const season = d.seasons[0];
  const se = d.isSeries ? Number(sp.se) || season?.season || 1 : undefined;
  const ep = d.isSeries ? Number(sp.ep) || season?.episodes[0]?.ep || 1 : undefined;
  const stream = subjectId ? await movieStream(subjectId, slug, se, ep) : null;
  const epList = d.seasons.find((s) => s.season === se)?.episodes ?? [];

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <nav aria-label="breadcrumb" className="flex items-center gap-1.5 px-1 text-[12.5px] font-bold text-plum-muted">
        <Link href="/movies" className="hover:text-frost-text">Movies &amp; Series</Link>
        <ChevronRight className="size-3.5" /><span className="truncate text-frost-text">{title}</span>
      </nav>

      {stream ? <MoviePlayer stream={stream} poster={d.poster} /> : (
        <div className="grid aspect-video w-full place-items-center rounded-[26px] border-1.5 border-night-line bg-night p-6 text-center text-night-muted">
          <div>
            <p className="text-[17px] font-extrabold text-night-text">Not streamable right now</p>
            <p className="mt-1 text-[13.5px]">This title has no sources yet{d.isSeries ? " for this episode" : ""}. Try another{d.isSeries ? " episode" : ""}.</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-box border-1.5 border-line bg-cream-card p-5">
        <div className="min-w-0">
          <div className="eyebrow">{d.type === "tv" ? "Series" : d.type}{d.year ? ` · ${d.year}` : ""}{se ? ` · S${se} E${ep}` : ""}</div>
          <h1 className="mt-1 text-balance text-[24px] font-extrabold leading-tight tracking-[-.8px]">{title}</h1>
          {d.rating && <div className="mt-1 flex items-center gap-1 text-[13px] font-bold text-plum-body"><Star className="size-3.5 text-sprinkle-star" fill="currentColor" />{d.rating}</div>}
          {d.genres.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{d.genres.slice(0, 6).map((g) => <span key={g} className="rounded-full border-1.5 border-line-soft bg-paper px-2.5 py-0.5 text-[11.5px] font-bold text-plum-muted">{g}</span>)}</div>}
          {d.overview && <p className="mt-3 max-w-prose text-[14px] leading-relaxed text-plum-body line-clamp-5">{d.overview}</p>}
        </div>
        <Poster src={d.poster} className="hidden aspect-[2/3] w-[120px] flex-none rounded-2xl border-1.5 border-line sm:block" />
      </div>

      {d.isSeries && epList.length > 0 && (
        <section className="rounded-box border-1.5 border-line bg-cream-card p-5">
          <h2 className="mb-3 text-lg font-extrabold tracking-[-.4px]">Episodes · Season {se}</h2>
          <ol className="scrollbar-none grid max-h-[420px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {epList.map((e) => {
              const on = e.ep === ep;
              return (
                <li key={e.ep}>
                  <Link href={`/movies/${slug}?se=${e.se}&ep=${e.ep}&sid=${encodeURIComponent(subjectId)}&t=${encodeURIComponent(title)}`} scroll={false}
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
