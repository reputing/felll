import Link from "next/link";
import { Poster } from "./poster";

export interface ShelfItem { id: number; title: string; image: string | null; note?: string }

/** A sideways-scrolling row of posters. */
export function Shelf({ title, eyebrow, items, href }: { title: string; eyebrow?: string; items: ShelfItem[]; href?: string }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between px-1">
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h2 className="mt-1 text-xl font-extrabold tracking-[-.6px]">{title}</h2>
        </div>
        {href && <Link href={href} className="text-[13px] font-bold text-frost-text hover:text-frost-deep">See all</Link>}
      </div>
      <div className="scrollbar-none -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
        {items.map((a) => (
          <Link key={a.id} href={`/anime/${a.id}`} className="group w-[148px] flex-none snap-start">
            <Poster src={a.image} className="aspect-[2/3] rounded-[18px] border-1.5 border-line shadow-poster transition duration-300 group-hover:-translate-y-1 group-hover:border-frost-hot" />
            <div className="mt-2 line-clamp-2 px-0.5 text-[13px] font-extrabold leading-tight">{a.title}</div>
            {a.note && <div className="px-0.5 text-[11.5px] font-semibold text-plum-muted">{a.note}</div>}
          </Link>
        ))}
      </div>
    </section>
  );
}

export function ShelfSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-6 w-56 rounded-full skeleton" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-[2/3] w-[148px] flex-none rounded-[18px] skeleton" />)}
      </div>
    </div>
  );
}
