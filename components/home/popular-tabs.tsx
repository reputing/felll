"use client";
import Link from "next/link";
import { useState } from "react";
import { Flame } from "lucide-react";
import { AnimatedTabs } from "@/components/fx/animated-tabs";
import { Poster } from "@/components/poster";
import { RANGES, type PopularItem, type Range } from "@/lib/popular";
import { cn } from "@/lib/utils";

// "Most popular" with a Today / Week / Month / All time switch (the signature board of the big anime sites). It is a glass panel
// with a light travelling round its edge; the posters sit in a snap-scrolling row on a phone and in a two-row grid from lg up,
// each with its rank set big and outlined over the corner. Switching windows re-plays the cards' entrance, staggered.
export function PopularTabs({ boards }: { boards: Record<Range, PopularItem[]> }) {
  const [range, setRange] = useState<Range>("week");
  const items = boards[range] ?? [];
  return (
    <section aria-label="most popular" className="glass-strong beam rounded-shell p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <div className="eyebrow">Most popular</div>
          <h2 className="mt-1 text-[22px] font-extrabold leading-none tracking-[-.8px] sm:text-[26px]">What everyone’s watching</h2>
        </div>
        <AnimatedTabs label="time window" value={range} onChange={setRange} tabs={RANGES} className="w-full sm:w-auto" />
      </div>
      <ol key={range} className="scrollbar-none -mx-1 mt-4 flex snap-x gap-3.5 overflow-x-auto px-1 pb-2 pt-1 sm:gap-4 lg:grid lg:grid-cols-5 lg:gap-x-5 lg:gap-y-6 lg:overflow-visible">
        {items.map((a, i) => (
          <li key={a.id} className="w-[132px] flex-none snap-start animate-in fade-in slide-in-from-bottom-3 fill-mode-both sm:w-[150px] lg:w-auto" style={{ animationDelay: `${i * 45}ms`, animationDuration: "420ms" }}>
            <Link href={`/anime/${a.id}`} className="group relative block">
              <span className="relative block">
                <Poster src={a.image} className="aspect-[2/3] rounded-[20px] border border-[var(--glass-line)] shadow-poster transition duration-300 group-hover:-translate-y-1 group-hover:border-frost-hot" />
                <span aria-hidden className="rank-num pointer-events-none absolute bottom-2 left-2.5 text-[46px] sm:text-[56px]">{i + 1}</span>
              </span>
              <span className="sr-only">Number {i + 1}: </span>
              <div className="mt-2.5 line-clamp-2 px-0.5 text-[13px] font-extrabold leading-tight">{a.title}</div>
              <div className={cn("mt-0.5 flex items-center gap-1 px-0.5 text-[11.5px] font-bold", a.hot ? "text-frost-text" : "text-plum-muted")}>
                {a.hot && <Flame className="size-3" fill="currentColor" />}{a.note}
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
