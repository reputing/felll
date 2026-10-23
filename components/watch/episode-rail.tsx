"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Play, Search, X } from "lucide-react";
import { Poster } from "@/components/poster";
import { Countdown, LocalTime } from "@/components/countdown";
import { cn } from "@/lib/utils";

const WEEK = 7 * 86400;

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
// shows. Matches on episode number or title. For currently-airing shows, episodes
// past the next broadcast slot are locked (not clickable) and the next one wears
// an "airing" badge with a live countdown.
export function EpisodeRail({ id, current, total, streamableCount, episodes, airing = false, airedThrough, nextEp = null, nextAt = null, broadcast }: {
  id: number; current: number; total: number; streamableCount: number; episodes: EpisodeEntry[];
  airing?: boolean; airedThrough?: number; nextEp?: number | null; nextAt?: number | null;
  broadcast?: { day: string | null; time: string | null };
}) {
  const gate = airedThrough ?? total;
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
          // Available if the show is finished, the episode is already streamable,
          // or it has aired. Otherwise it's locked (not out yet).
          const aired = !airing || e.streamable || e.n <= gate;
          const isNext = airing && !aired && e.n === nextEp;
          const airAt = nextAt != null && nextEp != null ? nextAt + (e.n - nextEp) * WEEK : null;
          const num = String(e.n).padStart(2, "0");
          const thumb = e.image ? (
            <span className="relative aspect-video w-[92px] flex-none overflow-hidden rounded-xl bg-night">
              <Poster src={e.image} className={cn("size-full transition", (!e.streamable || !aired) && "opacity-60 saturate-50")} />
              <span className="absolute left-1 top-1 grid min-w-5 place-items-center rounded-md bg-black/70 px-1 font-mono text-[10.5px] font-bold text-white">
                {on ? <Play className="size-3" fill="currentColor" /> : !aired ? <Clock className="size-3" /> : num}
              </span>
              {isNext && <span className="absolute inset-x-0 bottom-0 bg-frost/90 py-0.5 text-center text-[9.5px] font-extrabold uppercase tracking-wide text-frost-ink">Airing next</span>}
            </span>
          ) : (
            <span className={cn("grid size-10 flex-none place-items-center rounded-xl font-mono text-[13px]", on ? "bg-frost text-frost-ink" : !aired ? "bg-cream-tint text-plum-faint" : e.streamable ? "bg-paper text-frost-text" : "bg-cream-tint text-plum-faint")}>
              {on ? <Play className="size-4" fill="currentColor" /> : !aired ? <Clock className="size-4" /> : num}
            </span>
          );
          const body = (
            <span className="min-w-0 flex-1 py-0.5">
              <span className={cn("block truncate font-bold", !aired && "text-plum-muted")}>{aired ? e.title : `Episode ${e.n}`}</span>
              {aired && e.overview && <span className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-plum-muted">{e.overview}</span>}
              {!aired ? (
                isNext && airAt ? (
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-frost-text">
                    <Clock className="size-3" />Airs in <Countdown at={airAt} compact />
                  </span>
                ) : airAt ? (
                  <span className="mt-0.5 block text-[11px] font-semibold text-plum-muted">Airs <LocalTime at={airAt} opts={{ month: "short", day: "numeric" }} /></span>
                ) : (
                  <span className="mt-0.5 block text-[11px] font-semibold text-plum-muted">Not aired yet{broadcast?.day ? ` · ${broadcast.day}` : ""}</span>
                )
              ) : (
                <span className="mt-0.5 block text-[11px] font-semibold text-plum-muted">
                  {e.audio ? e.audio.replace(",", " · ").toUpperCase() : e.streamable ? "Stream" : "Not uploaded"}{e.filler ? " · filler" : ""}
                </span>
              )}
            </span>
          );
          return (
            <li key={e.n} ref={on ? activeRef : undefined}>
              {aired ? (
                <Link href={`/watch/${id}/${e.n}`} aria-current={on ? "page" : undefined} scroll={false}
                  className={cn("flex items-start gap-2.5 rounded-2xl p-1.5 text-[13px] transition hover:bg-cream-tint", on && "bg-cream-blush text-frost-deep")}>
                  {thumb}{body}
                </Link>
              ) : (
                <div aria-disabled className={cn("flex cursor-not-allowed items-start gap-2.5 rounded-2xl p-1.5 text-[13px]", isNext ? "bg-cream-tint/50" : "opacity-70")}>
                  {thumb}{body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
