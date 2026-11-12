import Link from "next/link";
import { ChevronRight, Star } from "lucide-react";
import { Poster } from "@/components/poster";
import type { MovieCard } from "@/lib/tmdb";
import type { ContinueItem } from "@/lib/movie-user";
import { KeepWatching } from "@/components/home/keep-watching";
import { movieKW } from "@/lib/movie-resume";

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

/** "Continue watching" on the movies hub: the same card as the home page's Keep watching. */
export function ContinueRail({ items, title = "Continue watching" }: { items: ContinueItem[]; title?: string }) {
  if (!items.length) return null;
  return <KeepWatching items={items.map(movieKW)} title={title} eyebrow="Pick up where you left off" historyHref="/movies/history" />;
}
