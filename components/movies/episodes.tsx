"use client";
import Link from "next/link";
import { Check, Eye } from "lucide-react";
import { useState } from "react";
import { Poster } from "@/components/poster";
import { toast } from "@/lib/store";
import { cn } from "@/lib/utils";

export interface EpRow { se: number; ep: number; title: string; overview?: string; thumb?: string | null; aired?: string | null }
interface Base { imdb: string; title: string; poster: string | null; year: number | null; episodes: number | null }

// A season's episodes, each with a tick for "I've watched this" (the same flag the player sets at 90%), so a series
// catches up the way an anime list does. Unaired episodes are listed but cannot be played or ticked.
export function Episodes({ slug, base, rows, watched: initial, current, season, ticks = true }: { ticks?: boolean; slug: string; base: Base; rows: EpRow[]; watched: number[]; current: number; season: number }) {
  const [seen, setSeen] = useState<Set<number>>(new Set(initial));
  const toggle = async (r: EpRow) => {
    const on = !seen.has(r.ep);
    setSeen((s) => { const n = new Set(s); if (on) n.add(r.ep); else n.delete(r.ep); return n; });
    try {
      const res = await fetch("/api/movie/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...base, media: "tv", season: r.se, episode: r.ep, epTitle: r.title, watched: on, unwatch: !on }) });
      if (!res.ok) throw new Error();
      toast(on ? `Episode ${r.ep} watched` : `Episode ${r.ep} unmarked`);
    } catch {
      setSeen((s) => { const n = new Set(s); if (on) n.delete(r.ep); else n.add(r.ep); return n; });
      toast("Couldn’t save that, try again");
    }
  };
  const now = Date.now();
  const done = rows.filter((r) => seen.has(r.ep)).length;
  return (
    <section className="rounded-box border-1.5 border-line bg-cream-card p-5">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-[-.4px]">Episodes · Season {season}</h2>
        {ticks && <span className="font-mono text-[12.5px] text-plum-muted">{done}/{rows.length} watched</span>}
      </div>
      <ol className="scrollbar-none grid max-h-[520px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {rows.map((r) => {
          const on = r.ep === current;
          const unaired = !!r.aired && Date.parse(r.aired) > now;
          const was = seen.has(r.ep);
          return (
            <li key={r.ep} className="flex items-stretch gap-1.5">
              <Link href={`/movies/${slug}?se=${r.se}&ep=${r.ep}`} scroll={false} aria-disabled={unaired} tabIndex={unaired ? -1 : undefined}
                className={cn("grid min-w-0 flex-1 grid-cols-[72px_1fr] items-center gap-3 rounded-2xl border-1.5 p-1.5 pr-3 transition hover:border-frost-hot", on ? "border-frost-hot bg-cream-blush" : "border-line-soft bg-paper", unaired && "pointer-events-none opacity-55")}>
                <span className="relative block">
                  <Poster src={r.thumb} className="aspect-video w-full rounded-lg" />
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1 font-mono text-[10.5px] font-bold text-white">{r.ep}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-extrabold">{r.title}</span>
                  <span className="block truncate text-[11.5px] font-semibold text-plum-muted">{unaired ? `Airs ${new Date(r.aired!).toLocaleDateString()}` : r.aired ? new Date(r.aired).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : ""}{on ? " · playing" : ""}</span>
                </span>
              </Link>
              {ticks && <button type="button" disabled={unaired} onClick={() => toggle(r)} aria-pressed={was} aria-label={was ? `Unmark episode ${r.ep}` : `Mark episode ${r.ep} watched`} title={was ? "Watched" : "Mark watched"}
                className={cn("grid w-10 flex-none place-items-center rounded-2xl border-1.5 transition", was ? "border-frost-hot bg-frost-hot text-white" : "border-line-soft bg-paper text-plum-muted hover:border-frost-hot hover:text-frost-text", unaired && "opacity-40")}>
                {was ? <Check className="size-4" strokeWidth={3} /> : <Eye className="size-4" />}
              </button>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
