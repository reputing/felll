"use client";
import Link from "next/link";
import { CalendarClock, Clock, Radio, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Countdown, LocalTime } from "@/components/countdown";
import { SaveIcon } from "@/components/icons";
import { Poster } from "@/components/poster";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatLabel, type Anime } from "@/lib/jikan";
import { actions, useBox } from "@/lib/store";
import { refOf } from "@/lib/anime-ref";
import { cn, compact } from "@/lib/utils";

export type SeasonItem = Anime & { nextAt: number | null; nextEp: number | null; premiere: number | null };

const SORTS = { next: "Next episode", score: "Score", members: "Popularity", premiere: "Premiere date", title: "A–Z" } as const;
type SortKey = keyof typeof SORTS;
const FORMATS = [["all", "All"], ["TV", "TV"], ["Movie", "Films"], ["ONA", "ONA"], ["OVA", "OVA"], ["Special", "Specials"]] as const;

export function SeasonBoard({ items, upcoming }: { items: SeasonItem[]; upcoming?: boolean }) {
  const [sort, setSort] = useState<SortKey>(upcoming ? "premiere" : "members");
  const [fmt, setFmt] = useState("all");
  const [onlyAiring, setOnlyAiring] = useState(false);
  const lib = useBox((s) => s.lib);

  const list = useMemo(() => {
    const out = items.filter((a) => (fmt === "all" || a.format === fmt) && (!onlyAiring || a.nextAt));
    const by: Record<SortKey, (a: SeasonItem, b: SeasonItem) => number> = {
      next: (a, b) => (a.nextAt ?? a.premiere ?? Infinity) - (b.nextAt ?? b.premiere ?? Infinity),
      score: (a, b) => b.scoreN - a.scoreN,
      members: (a, b) => b.members - a.members,
      premiere: (a, b) => (a.premiere ?? Infinity) - (b.premiere ?? Infinity),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return out.sort(by[sort]);
  }, [items, sort, fmt, onlyAiring]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FORMATS.map(([v, l]) => {
          const n = v === "all" ? items.length : items.filter((a) => a.format === v).length;
          if (!n) return null;
          return (
            <button key={v} type="button" aria-pressed={fmt === v} onClick={() => setFmt(v)}
              className={cn("flex h-10 items-center gap-2 rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold hover:border-frost-hot", fmt === v && "border-frost-hot bg-frost text-frost-ink")}>
              {l}<span className="font-mono text-[11.5px] opacity-70">{n}</span>
            </button>
          );
        })}
        {!upcoming && (
          <button type="button" aria-pressed={onlyAiring} onClick={() => setOnlyAiring(!onlyAiring)}
            className={cn("flex h-10 items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold hover:border-frost-hot", onlyAiring && "border-frost-hot bg-cream-blush text-frost-deep")}>
            <Radio className="size-3.5" />Airing now
          </button>
        )}
        <span className="flex-1" />
        <span className="text-[12px] font-bold uppercase tracking-[.12em] text-plum-muted">Rank by</span>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger aria-label="Rank by"><SelectValue /></SelectTrigger>
          <SelectContent align="end">{Object.entries(SORTS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <ol className="grid gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
        {list.map((a, i) => {
          const saved = !!lib[a.id]?.status;
          const soon = a.premiere && a.premiere * 1000 > Date.now();
          return (
            <li key={a.id} className="spotlight group grid grid-cols-[118px_1fr] gap-4 rounded-3xl border-1.5 border-line bg-cream-card p-2.5 pr-4 transition hover:border-line-hot animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
              <Link href={`/anime/${a.id}`} className="relative">
                <Poster src={a.poster} color={a.color} className="aspect-[2/3] rounded-[18px] shadow-poster transition duration-300 group-hover:-translate-y-0.5" />
                <span className={cn("absolute -left-1 -top-1 grid size-9 place-items-center rounded-xl border-1.5 border-cream-card font-mono text-[14px] font-medium", i < 3 ? "bg-frost text-frost-ink" : "bg-night text-night-text")}>{i + 1}</span>
              </Link>
              <div className="flex min-w-0 flex-col gap-2 py-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/anime/${a.id}`} className="line-clamp-2 text-[16px] font-extrabold leading-tight tracking-[-.3px] hover:text-frost-text">{a.title}</Link>
                    <div className="mt-0.5 truncate text-[12px] font-semibold text-plum-muted">{[a.studio, formatLabel(a), a.episodes ? `${a.episodes} eps` : null, a.source].filter(Boolean).join(" · ")}</div>
                  </div>
                  <button type="button" aria-pressed={saved} aria-label={saved ? "Remove from box" : "Save"} onClick={() => actions.toggleSave(refOf(a))}
                    className={cn("grid size-9 flex-none place-items-center rounded-xl border-1.5 border-line bg-paper hover:border-frost-hot", saved && "border-frost-hot bg-frost-hot text-white")}>
                    <SaveIcon on={saved} className="size-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">{a.genres.slice(0, 3).map((g) => <span key={g} className="rounded-full bg-cream-tint px-2 py-0.5 text-[11px] font-bold text-plum-body">{g}</span>)}</div>

                {a.nextAt ? (
                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-cream-blush px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[10.5px] font-bold uppercase tracking-[.1em] text-frost-deep">{a.nextEp ? `EP ${a.nextEp} drops` : "Next episode"}</div>
                      <LocalTime at={a.nextAt} className="text-[12px] font-semibold text-plum-body" />
                    </div>
                    <Countdown at={a.nextAt} className="text-[14px] font-medium text-frost-text" />
                  </div>
                ) : soon ? (
                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-cream-tint px-3 py-2">
                    <div>
                      <div className="text-[10.5px] font-bold uppercase tracking-[.1em] text-plum-muted">Premieres</div>
                      <LocalTime at={a.premiere!} opts={{ month: "short", day: "numeric", weekday: "short" }} className="text-[12px] font-semibold" />
                    </div>
                    <Countdown at={a.premiere!} compact className="text-[13px] text-frost-text" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-plum-muted">
                    <CalendarClock className="size-3.5" />{a.premiere ? <>Premiered <LocalTime at={a.premiere} opts={{ month: "short", day: "numeric", year: "numeric" }} /></> : a.aired || "Date TBA"}
                  </div>
                )}

                <p className="line-clamp-2 text-[12.5px] leading-relaxed text-plum-muted">{a.description}</p>
                <div className="mt-auto flex items-center gap-3 text-[12px] font-bold text-plum-body">
                  <span><span className="text-sprinkle-star">★</span> {a.score}</span>
                  <span className="flex items-center gap-1"><Users className="size-3.5 text-plum-muted" />{compact(a.members)}</span>
                  {a.broadcast.day && <span className="flex items-center gap-1 truncate text-plum-muted"><Clock className="size-3.5" />{a.broadcast.day.replace(/s$/, "")}s</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {list.length === 0 && <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">Nothing here with those filters.</p>}
    </div>
  );
}
