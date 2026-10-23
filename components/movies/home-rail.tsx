import Link from "next/link";
import { ChevronRight, Star } from "lucide-react";
import { Poster } from "@/components/poster";
import { tmdbTrending } from "@/lib/tmdb";

// A broad "beyond anime" rail for the home page. Hidden when TMDB isn't
// configured (tmdbTrending returns []).
export async function MoviesHomeRail() {
  const items = await tmdbTrending(16).catch(() => []);
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between px-1">
        <div><div className="eyebrow">Beyond anime</div><h2 className="mt-1 text-xl font-extrabold tracking-[-.6px]">Popular movies &amp; series</h2></div>
        <Link href="/movies" className="flex items-center gap-1 text-[12.5px] font-bold text-frost-text hover:text-frost-deep">All movies<ChevronRight className="size-3.5" strokeWidth={2.6} /></Link>
      </div>
      <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
        {items.map((m) => (
          <Link key={m.slug} href={`/movies/${m.slug}`} className="group w-[128px] flex-none">
            <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-1.5 border-line transition group-hover:-translate-y-1 group-hover:border-frost-hot">
              <Poster src={m.poster} className="size-full" />
              {m.rating && <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-lg bg-black/70 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white backdrop-blur"><Star className="size-3 text-sprinkle-star" fill="currentColor" />{m.rating}</span>}
            </div>
            <div className="mt-1.5 line-clamp-2 px-0.5 text-[12.5px] font-extrabold leading-tight">{m.title}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
