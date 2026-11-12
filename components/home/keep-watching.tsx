"use client";
import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Poster } from "@/components/poster";
import { clock } from "@/lib/utils";

import type { KWItem } from "@/lib/keep-watching";

/** "Keep watching": the cards of whatever you were in the middle of. The home page feeds it anime and films and series
 *  together; the movies hub feeds it films and series only. */
export function KeepWatching({ items, title = "Keep watching", historyHref = "/box/history", eyebrow }: { items: KWItem[]; title?: string; historyHref?: string; eyebrow?: string }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const shown = items.filter((r) => !gone.has(r.key));
  if (!shown.length) return null;
  // take one off the rail (dropped it, or just done with it); its list status is untouched
  const remove = (r: KWItem) => {
    setGone((g) => new Set(g).add(r.key));
    fetch(r.removeUrl, { method: "DELETE" }).catch(() => setGone((g) => { const n = new Set(g); n.delete(r.key); return n; }));
  };
  return (
    <section aria-labelledby="kw">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2 id="kw" className="text-xl font-extrabold tracking-[-.6px]">{title}</h2></div>
        <Link href={historyHref} className="text-[13px] font-bold text-frost-text hover:text-frost-deep">History</Link>
      </div>
      <div className="scrollbar-none -mt-2 flex gap-3.5 overflow-x-auto pb-1 pt-2">
        {shown.map((r) => {
          const pct = r.duration ? Math.min(100, (r.position / r.duration) * 100) : 0;
          return (
            <div key={r.key} className="group/kw relative flex-none">
              <Link href={r.href} className="spotlight group flex w-[248px] flex-col gap-2 rounded-[22px] border-1.5 border-line bg-cream-card px-[7px] pb-3 pt-[7px] transition hover:-translate-y-0.5 hover:border-frost-hot hover:shadow-lift">
                <span className="relative aspect-video overflow-hidden rounded-2xl">
                  <Poster src={r.image} className="absolute inset-0 [&>img]:object-[center_25%] [&>img]:transition-transform [&>img]:duration-500 group-hover:[&>img]:scale-105" />
                  <Badge variant="paper" size="sm" className="absolute left-2 top-2 rounded-full bg-cream-card/90 font-extrabold">{r.badge}</Badge>
                  {r.duration > 0 && <span className="absolute bottom-3 right-2 flex h-[22px] items-center rounded-[7px] bg-night/85 px-[7px] font-mono text-[11px] text-night-text">{clock(r.position)} / {clock(r.duration)}</span>}
                  {pct > 0 && <Progress value={pct} className="absolute inset-x-2 bottom-[5px] w-auto" aria-label={`${Math.round(pct)}% watched`} />}
                </span>
                <span className="min-w-0 px-[5px]">
                  <span className="block truncate font-extrabold leading-tight">{r.title}</span>
                  {r.sub && <span className="block truncate text-[12px] font-semibold text-plum-muted">{r.sub}</span>}
                </span>
              </Link>
              <button type="button" onClick={() => remove(r)} aria-label={`Remove ${r.title} from keep watching`} title="remove from keep watching"
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
