import Link from "next/link";
import { ChevronRight, Play, Star } from "lucide-react";
import { Poster } from "@/components/poster";
import type { MovieCard } from "@/lib/tmdb";
import type { ContinueItem } from "@/lib/movie-user";

// A shelf of posters, the way the home page shelves anime.
export function Rail({ eyebrow, title, items, href }: { eyebrow?: string; title: string; items: MovieCard[]; href?: string }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between px-1">
        <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2 className="mt-0.5 text-xl font-extrabold tracking-[-.6px]">{title}</h2></div>
        {href && <Link href={href} className="flex items-center gap-1 text-[12.5px] font-bold text-frost-text hover:text-frost-deep">See all<ChevronRight className="size-3.5" strokeWidth={2.6} /></Link>}
      </div>
      <div className="scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {items.map((m) => (
          <Link key={m.slug} href={`/movies/${m.slug}`} className="group w-[132px] flex-none sm:w-[148px]">
            <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-1.5 border-line shadow-poster transition group-hover:-translate-y-1 group-hover:border-frost-hot">
              <Poster src={m.poster} className="size-full" />
              {m.rating && <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-lg bg-black/70 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white backdrop-blur"><Star className="size-3 text-sprinkle-star" fill="currentColor" />{m.rating}</span>}
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[.08em] text-white">{m.media === "tv" ? "series" : "film"}</span>
            </div>
            <div className="mt-1.5 line-clamp-2 px-0.5 text-[13px] font-extrabold leading-tight">{m.title}</div>
            {m.year && <div className="px-0.5 text-[11.5px] font-semibold text-plum-muted">{m.year}</div>}
          </Link>
        ))}
      </div>
    </section>
  );
}

const clock = (s: number) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };

/** "Continue watching": the film you stopped in, or the episode you are on (the next one once it is finished). */
export function ContinueRail({ items, title = "Continue watching" }: { items: ContinueItem[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="px-1"><div className="eyebrow">Pick up where you left off</div><h2 className="mt-0.5 text-xl font-extrabold tracking-[-.6px]">{title}</h2></div>
      <div className="scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {items.map((r) => {
          const pct = r.duration > 0 ? Math.min(100, (r.position / r.duration) * 100) : 0;
          const tv = r.media === "tv";
          const href = tv ? `/movies/tv-${r.imdb_id}${r.watched ? "" : `?se=${r.season}&ep=${r.episode}`}` : `/movies/movie-${r.imdb_id}`;
          return (
            <Link key={r.imdb_id} href={href} className="group grid w-[300px] flex-none grid-cols-[84px_1fr] items-center gap-3 rounded-3xl border-1.5 border-line bg-cream-card p-2 pr-3 transition hover:border-frost-hot">
              <Poster src={r.poster} className="aspect-[2/3] w-[84px] rounded-2xl" />
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-extrabold">{r.title}</span>
                <span className="block truncate text-[12px] font-semibold text-plum-muted">
                  {tv ? (r.watched ? `Up next after S${r.season} E${r.episode}` : `S${r.season} E${r.episode}${r.ep_title ? ` · ${r.ep_title}` : ""}`) : r.duration ? `${clock(Math.max(0, r.duration - r.position))} left` : "Started"}
                </span>
                {pct > 0 && !r.watched && <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-cream-tint"><span className="block h-full rounded-full bg-frost-hot" style={{ width: `${pct}%` }} /></span>}
                <span className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-frost px-3 text-[12px] font-extrabold text-frost-ink"><Play className="size-3" fill="currentColor" />{r.watched && tv ? "Next episode" : "Resume"}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
