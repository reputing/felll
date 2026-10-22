"use client";
import Link from "next/link";
import { X } from "lucide-react";
import { Poster } from "@/components/poster";
import { removeFromQueue, useQueue } from "@/lib/queue";

// Your "watch next" queue, as a rail on the home page. Hidden when empty.
export function QueueRail() {
  const q = useQueue();
  if (!q.length) return null;
  return (
    <section aria-labelledby="queue" className="flex flex-col gap-3">
      <div className="flex items-end justify-between px-1">
        <div><div className="eyebrow">Up next</div><h2 id="queue" className="mt-1 text-xl font-extrabold tracking-[-.6px]">Your queue</h2></div>
        <span className="font-mono text-[13px] text-plum-muted">{q.length}</span>
      </div>
      <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
        {q.map((it) => (
          <div key={it.id} className="group relative w-[146px] flex-none">
            <Link href={`/anime/${it.id}`}>
              <Poster src={it.image} className="aspect-[2/3] rounded-2xl border-1.5 border-line shadow-poster transition group-hover:-translate-y-1" />
            </Link>
            <button type="button" onClick={() => removeFromQueue(it.id)} aria-label={`Remove ${it.title}`} className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition hover:bg-black/80 group-hover:opacity-100">
              <X className="size-3.5" />
            </button>
            <div className="mt-1.5 line-clamp-2 text-[12.5px] font-bold leading-tight">{it.title}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
