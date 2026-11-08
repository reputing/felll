"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Poster } from "@/components/poster";
import { cn } from "@/lib/utils";
import type { Group, TimelineEntry } from "@/lib/franchise";

// The whole franchise in release order, every entry labelled by how it relates, filterable. Recaps
// and compilations are marked skippable (they retell what you've seen).
const FORMAT: Record<string, string> = { TV: "TV", TV_SHORT: "Short", MOVIE: "Movie", OVA: "OVA", ONA: "ONA", SPECIAL: "Special", MUSIC: "Music" };
const GROUPS: { key: Group; label: string; chip: string; tag: string }[] = [
  { key: "main", label: "Main line", chip: "bg-frost text-frost-ink", tag: "text-frost-text" },
  { key: "alt", label: "Alternate version", chip: "bg-sprinkle-lilac/25 text-sprinkle-lilac", tag: "text-sprinkle-lilac" },
  { key: "side", label: "Side story / spin-off", chip: "bg-sprinkle-butter/30 text-amber-600", tag: "text-amber-600" },
  { key: "recap", label: "Recap", chip: "bg-cream-tint text-plum-muted", tag: "text-plum-muted" },
];

export function StoryMap({ timeline: first, malId, partial }: { timeline: TimelineEntry[]; malId: number; partial?: boolean }) {
  const [timeline, setTimeline] = useState(first);
  const [only, setOnly] = useState<Group | "all">("all");
  const [more, setMore] = useState(!!partial);
  // A big franchise is looked up a slice at a time (each slice is cached for everyone); keep asking
  // until the whole map is in, so it completes by itself instead of needing a reload.
  useEffect(() => {
    if (!partial) return;
    let stop = false;
    (async () => {
      for (let i = 0; i < 6 && !stop; i++) {
        const d = await fetch(`/api/public/franchise?mal=${malId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (stop || !d?.franchise) break;
        setTimeline(d.franchise.timeline);
        if (!d.franchise.partial) break;
      }
      if (!stop) setMore(false);
    })();
    return () => { stop = true; };
  }, [partial, malId]);
  const counts = Object.fromEntries(GROUPS.map((g) => [g.key, timeline.filter((e) => e.group === g.key).length])) as Record<Group, number>;
  const shown = timeline.map((e, i) => ({ e, n: i + 1 })).filter(({ e }) => only === "all" || e.group === only || e.current);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><div className="eyebrow">Story map</div><h2 className="mt-1 text-lg font-extrabold tracking-[-.4px]">{timeline.length} entries, in release order{more ? " · finding the rest…" : ""}</h2></div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={only === "all"} onClick={() => setOnly("all")} className={cn("h-8 rounded-full border-1.5 px-3 text-[12px] font-bold", only === "all" ? "border-frost-hot bg-frost text-frost-ink" : "border-line hover:border-frost-hot")}>All {timeline.length}</button>
          {GROUPS.filter((g) => counts[g.key] > 0).map((g) => (
            <button key={g.key} type="button" aria-pressed={only === g.key} onClick={() => setOnly(g.key)} className={cn("h-8 rounded-full border-1.5 px-3 text-[12px] font-bold", only === g.key ? "border-frost-hot bg-frost text-frost-ink" : "border-line hover:border-frost-hot")}>{g.label} {counts[g.key]}</button>
          ))}
        </div>
      </div>
      <ol className="mt-3 flex flex-col gap-1.5">
        {shown.map(({ e, n }) => {
          const g = GROUPS.find((x) => x.key === e.group)!;
          const inner = (
            <>
              <span className="grid w-7 flex-none place-items-center font-mono text-[12px] text-plum-muted">{n}</span>
              <Poster src={e.cover} className="h-[54px] w-[38px] flex-none rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13.5px] font-extrabold", e.group === "recap" && "text-plum-muted")}>{e.title}</span>
                <span className="block text-[11.5px] font-semibold text-plum-muted">
                  {[FORMAT[e.format ?? ""] ?? e.format, e.year, e.episodes ? `${e.episodes} ep` : null].filter(Boolean).join(" · ")}
                  {e.group === "recap" ? " · skippable" : ""}
                </span>
              </span>
              <span className={cn("hidden flex-none rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[.06em] sm:inline", g.chip)}>{e.current ? "you are here" : g.label}</span>
              {e.current && <span className="sm:hidden text-[10.5px] font-extrabold uppercase text-frost-text">here</span>}
            </>
          );
          const row = cn("flex items-center gap-2.5 rounded-2xl border-1.5 p-1.5 pr-3 transition", e.current ? "border-frost-hot bg-cream-blush" : "border-line-soft bg-paper hover:border-frost-hot");
          return <li key={e.malId}>{e.current ? <div className={row} aria-current="page">{inner}</div> : <Link href={`/anime/${e.malId}`} className={row}>{inner}</Link>}</li>;
        })}
      </ol>
      <p className="mt-2 text-[11.5px] font-semibold text-plum-muted">Release order. In-universe chronology isn&apos;t in the data we have, so check the labels: alternate versions retell the same story, recaps can be skipped.</p>
    </div>
  );
}
