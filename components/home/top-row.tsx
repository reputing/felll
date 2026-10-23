import Link from "next/link";
import { Poster } from "@/components/poster";
import type { ShelfItem } from "@/components/shelf";

/** A ranked row — like Shelf, but each poster wears its position. Netflix's
 *  "Top 10" row. */
export function TopRow({ title, eyebrow, items, href }: { title: string; eyebrow?: string; items: ShelfItem[]; href?: string }) {
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
        {items.slice(0, 10).map((a, i) => (
          <Link key={a.id} href={`/anime/${a.id}`} className="group w-[148px] flex-none snap-start">
            <span className="relative block">
              <Poster src={a.image} className="aspect-[2/3] rounded-[18px] border-1.5 border-line shadow-poster transition duration-300 group-hover:-translate-y-1 group-hover:border-frost-hot" />
              <span className="absolute left-1.5 top-1.5 grid h-7 min-w-7 place-items-center rounded-xl bg-black/75 px-1.5 font-mono text-[15px] font-extrabold text-white backdrop-blur">{i + 1}</span>
            </span>
            <div className="mt-2 line-clamp-2 px-0.5 text-[13px] font-extrabold leading-tight">{a.title}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
