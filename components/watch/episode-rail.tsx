"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Search, X } from "lucide-react";
import { Poster } from "@/components/poster";
import { cn } from "@/lib/utils";

export interface EpisodeEntry {
  n: number;
  title: string;
  overview: string | null;
  image: string | null;
  audio: string | null; // "sub", "sub,dub", … or null
  streamable: boolean;
  filler: boolean;
}

// The watch-page episode list, with a search box — essential for 1000+ episode
// shows. Matches on episode number or title.
export function EpisodeRail({ id, current, total, streamableCount, episodes }: {
  id: number; current: number; total: number; streamableCount: number; episodes: EpisodeEntry[];
}) {
  const [q, setQ] = useState("");
  const activeRef = useRef<HTMLLIElement>(null);

  const query = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return episodes;
    const asNum = Number(query);
    return episodes.filter((e) =>
      (Number.isFinite(asNum) && String(e.n).includes(query)) || e.title.toLowerCase().includes(query),
    );
  }, [episodes, query]);

  // jump the current episode into view when the list first mounts
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <aside className="watch-side flex max-h-[calc(100svh-120px)] flex-col overflow-hidden rounded-box border-1.5 border-line bg-cream-card/80 backdrop-blur-xl lg:sticky lg:top-[100px]">
      <div className="flex items-center justify-between border-b-1.5 border-line-soft px-4 py-3.5">
        <h2 className="font-extrabold">Episodes</h2>
        <span className="rounded-full bg-cream-tint px-2.5 py-0.5 font-mono text-[12px] text-plum-muted">{streamableCount}/{total}</span>
      </div>
      <div className="border-b-1.5 border-line-soft p-2.5">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-plum-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            inputMode="search"
            placeholder="Search episode or number…"
            aria-label="Search episodes"
            className="h-10 w-full rounded-full border-1.5 border-line bg-paper pl-9 pr-9 text-[13px] font-semibold text-plum outline-none transition focus:border-frost-hot focus:shadow-halo"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear" className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full hover:bg-cream-tint">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <ol className="scrollbar-none flex-1 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <li className="px-3 py-8 text-center text-[13px] font-semibold text-plum-muted">No episode matches “{q}”.</li>
        )}
        {filtered.map((e) => {
          const on = e.n === current;
          const sub = `${e.audio ? e.audio.replace(",", " · ").toUpperCase() : e.streamable ? "Stream" : "Not uploaded"}${e.filler ? " · filler" : ""}`;
          return (
            <li key={e.n} ref={on ? activeRef : undefined}>
              <Link href={`/watch/${id}/${e.n}`} aria-current={on ? "page" : undefined} scroll={false}
                className={cn("flex items-start gap-2.5 rounded-2xl p-1.5 text-[13px] transition hover:bg-cream-tint", on && "bg-cream-blush text-frost-deep")}>
                {e.image ? (
                  <span className="relative aspect-video w-[92px] flex-none overflow-hidden rounded-xl bg-night">
                    <Poster src={e.image} className={cn("size-full transition", !e.streamable && "opacity-60 saturate-50")} />
                    <span className="absolute left-1 top-1 grid min-w-5 place-items-center rounded-md bg-black/70 px-1 font-mono text-[10.5px] font-bold text-white">
                      {on ? <Play className="size-3" fill="currentColor" /> : String(e.n).padStart(2, "0")}
                    </span>
                  </span>
                ) : (
                  <span className={cn("grid size-10 flex-none place-items-center rounded-xl font-mono text-[13px]", on ? "bg-frost text-frost-ink" : e.streamable ? "bg-paper text-frost-text" : "bg-cream-tint text-plum-faint")}>
                    {on ? <Play className="size-4" fill="currentColor" /> : String(e.n).padStart(2, "0")}
                  </span>
                )}
                <span className="min-w-0 flex-1 py-0.5">
                  <span className="block truncate font-bold">{e.title}</span>
                  {e.overview && <span className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-plum-muted">{e.overview}</span>}
                  <span className="mt-0.5 block text-[11px] font-semibold text-plum-muted">{sub}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
