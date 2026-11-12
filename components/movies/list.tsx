"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Heart, Star } from "lucide-react";
import { Poster } from "@/components/poster";
import { cn, STATUS_LABEL } from "@/lib/utils";
import type { ListItem } from "@/lib/movie-user";

// "My list" for films and series: the same tabs a member's anime box has (watching, plan to watch, completed, on hold,
// dropped) plus favourites, and a switch between films and series.
const TABS = [["all", "All"], ["watching", STATUS_LABEL.watching], ["planning", STATUS_LABEL.planning], ["completed", STATUS_LABEL.completed], ["paused", STATUS_LABEL.paused], ["dropped", STATUS_LABEL.dropped], ["fav", "Favourites"]] as const;

export function MovieList({ rows, initialTab }: { rows: ListItem[]; initialTab: string }) {
  const [tab, setTab] = useState<string>(initialTab);
  const [kind, setKind] = useState<"all" | "movie" | "tv">("all");
  const shown = useMemo(() => rows.filter((r) => (kind === "all" || r.media === kind) && (tab === "all" || (tab === "fav" ? !!r.favorite : r.status === tab))), [rows, tab, kind]);
  const count = (t: string) => rows.filter((r) => (kind === "all" || r.media === kind) && (t === "all" || (t === "fav" ? !!r.favorite : r.status === t))).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(([v, label]) => (
          <button key={v} type="button" aria-pressed={tab === v} onClick={() => setTab(v)}
            className={cn("h-10 rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold hover:border-frost-hot", tab === v && "border-frost-hot bg-frost text-frost-ink")}>
            {label} <span className="ml-1 font-mono text-[11.5px] opacity-70">{count(v)}</span>
          </button>
        ))}
        <span aria-hidden className="mx-1 hidden h-6 w-px bg-line sm:block" />
        {([["all", "Both"], ["movie", "Films"], ["tv", "Series"]] as const).map(([v, label]) => (
          <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)}
            className={cn("h-10 rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold hover:border-frost-hot", kind === v && "border-frost-hot bg-frost text-frost-ink")}>{label}</button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">
          {rows.length === 0 ? "Nothing here yet. Open a film or series and press “Add to my list”." : "Nothing in this tab."}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5">
          {shown.map((r) => (
            <Link key={r.imdb_id} href={`/movies/${r.media}-${r.imdb_id}`} className="group flex flex-col gap-2">
              <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-1.5 border-line transition group-hover:-translate-y-1 group-hover:border-frost-hot">
                <Poster src={r.poster ?? `https://images.metahub.space/poster/small/${r.imdb_id}/img`} className="size-full" />
                {r.score != null && <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-lg bg-black/70 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white backdrop-blur"><Star className="size-3 text-sprinkle-star" fill="currentColor" />{r.score}</span>}
                {!!r.favorite && <span className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-frost-hot text-white"><Heart className="size-3.5" fill="currentColor" /></span>}
                {r.media === "tv" && r.episodes ? (
                  <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/50"><span className="block h-full bg-frost-hot" style={{ width: `${Math.min(100, (r.progress / r.episodes) * 100)}%` }} /></span>
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-extrabold leading-tight">{r.title}</div>
                <div className="text-[11.5px] font-semibold text-plum-muted">{r.media === "tv" ? `Series${r.episodes ? ` · ${r.progress}/${r.episodes}` : ""}` : "Film"}{r.year ? ` · ${r.year}` : ""}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
