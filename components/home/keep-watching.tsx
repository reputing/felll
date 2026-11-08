"use client";
import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Poster } from "@/components/poster";
import { clock } from "@/lib/utils";

export interface Resume { mal_id: number; episode: number; position: number; duration: number; title: string; image: string | null }

export function KeepWatching({ items }: { items: Resume[] }) {
  const [gone, setGone] = useState<Set<number>>(new Set());
  const shown = items.filter((r) => !gone.has(r.mal_id));
  if (!shown.length) return null;
  // take a show off the rail (dropped it, or just done with it); its list status is untouched
  const remove = (id: number) => {
    setGone((g) => new Set(g).add(id));
    fetch(`/api/progress?malId=${id}`, { method: "DELETE" }).catch(() => setGone((g) => { const n = new Set(g); n.delete(id); return n; }));
  };
  return (
    <section aria-labelledby="kw">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h2 id="kw" className="text-xl font-extrabold tracking-[-.6px]">Keep watching</h2>
        <Link href="/box/history" className="text-[13px] font-bold text-frost-text hover:text-frost-deep">History</Link>
      </div>
      <div className="scrollbar-none flex gap-3.5 overflow-x-auto pb-1">
        {shown.map((r) => {
          const pct = r.duration ? (r.position / r.duration) * 100 : 0;
          return (
            <div key={r.mal_id} className="group/kw relative flex-none">
              <Link href={`/watch/${r.mal_id}/${r.episode}`} className="spotlight group flex w-[248px] flex-col gap-2 rounded-[22px] border-1.5 border-line bg-cream-card px-[7px] pb-3 pt-[7px] transition hover:-translate-y-0.5 hover:border-frost-hot hover:shadow-lift">
                <span className="relative aspect-video overflow-hidden rounded-2xl">
                  <Poster src={r.image} className="absolute inset-0 [&>img]:object-[center_25%] [&>img]:transition-transform [&>img]:duration-500 group-hover:[&>img]:scale-105" />
                  <Badge variant="paper" size="sm" className="absolute left-2 top-2 rounded-full bg-cream-card/90 font-extrabold">EP {r.episode}</Badge>
                  {r.duration > 0 && <span className="absolute bottom-3 right-2 flex h-[22px] items-center rounded-[7px] bg-night/85 px-[7px] font-mono text-[11px] text-night-text">{clock(r.position)} / {clock(r.duration)}</span>}
                  <Progress value={pct} className="absolute inset-x-2 bottom-[5px] w-auto" aria-label={`${Math.round(pct)}% watched`} />
                </span>
                <span className="truncate px-[5px] font-extrabold leading-tight">{r.title}</span>
              </Link>
              <button type="button" onClick={() => remove(r.mal_id)} aria-label={`Remove ${r.title} from keep watching`} title="remove from keep watching"
                className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-black/65 text-white opacity-0 backdrop-blur transition hover:bg-black/85 focus-visible:opacity-100 group-hover/kw:opacity-100 max-sm:opacity-100">
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
