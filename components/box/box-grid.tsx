"use client";
import Link from "next/link";
import { Heart, Plus, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Poster } from "@/components/poster";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveEntry, useBox } from "@/lib/store";
import { cn, STATUS_LABEL, STATUSES, type ListStatus } from "@/lib/utils";

export interface BoxRow { mal_id: number; title: string; image: string | null; episodes: number | null; kind: string | null; updated_at: number; status: ListStatus | null; score: number | null; favorite: number; progress: number }

const TABS = ["all", ...STATUSES, "favorites"] as const;
type Tab = (typeof TABS)[number];
const tabLabel = (t: Tab) => (t === "all" ? "Everything" : t === "favorites" ? "Favourites" : STATUS_LABEL[t]);

export function BoxGrid({ rows, readOnly, initialTab = "watching" }: { rows: BoxRow[]; readOnly?: boolean; initialTab?: Tab }) {
  const lib = useBox((s) => s.lib);
  const seeded = useBox((s) => s.seeded);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [sort, setSort] = useState("updated");
  // on your own box, the store is the truth (changes show up instantly)
  const live = useMemo(() => rows.map((r) => {
    if (readOnly || !seeded) return r;
    const e = lib[r.mal_id];
    return e ? { ...r, status: e.status, score: e.score, favorite: e.favorite ? 1 : 0, progress: e.progress } : { ...r, status: null, score: null, favorite: 0 };
  }).filter((r) => r.status || r.score || r.favorite), [rows, lib, readOnly, seeded]);

  const count = (t: Tab) => live.filter((r) => (t === "all" ? true : t === "favorites" ? r.favorite : r.status === t)).length;
  const shown = live
    .filter((r) => (tab === "all" ? true : tab === "favorites" ? r.favorite : r.status === tab))
    .sort((a, b) => sort === "score" ? (b.score ?? 0) - (a.score ?? 0) : sort === "title" ? a.title.localeCompare(b.title) : b.updated_at - a.updated_at);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}
              className={cn("flex h-10 flex-none items-center gap-2 rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold hover:border-frost-hot", tab === t && "border-frost-hot bg-frost text-frost-ink")}>
              {tabLabel(t)}<span className="font-mono text-[11.5px] opacity-70">{count(t)}</span>
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger aria-label="Sort"><SelectValue /></SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="updated">Recently updated</SelectItem>
            <SelectItem value="score">Your score</SelectItem>
            <SelectItem value="title">A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {shown.length === 0 ? (
        <div className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center">
          <p className="text-lg font-extrabold">Nothing {tab === "all" ? "here" : `in ${tabLabel(tab).toLowerCase()}`} yet.</p>
          {!readOnly && <Link href="/seasonal" className="mt-2 inline-block font-bold text-frost-text">Find something this season →</Link>}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3.5">
          {shown.map((r) => {
            const pct = r.episodes ? (r.progress / r.episodes) * 100 : 0;
            return (
              <div key={r.mal_id} className="spotlight group flex flex-col gap-2 rounded-3xl border-1.5 border-line bg-cream-card p-2 transition hover:border-line-hot">
                <Link href={`/anime/${r.mal_id}`} className="relative">
                  <Poster src={r.image} className="aspect-[2/3] rounded-[18px] transition duration-300 group-hover:scale-[1.02]" />
                  {r.favorite ? <Heart className="absolute right-2 top-2 size-6 rounded-full bg-frost-hot p-1 text-white" fill="currentColor" /> : null}
                  {r.score ? <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-night/85 px-2 py-0.5 text-[11.5px] font-extrabold text-night-text backdrop-blur"><Star className="size-3 fill-sprinkle-star text-sprinkle-star" />{r.score}</span> : null}
                  {r.status && <span className="absolute bottom-2 left-2 rounded-full bg-cream-card/90 px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[.06em] text-plum backdrop-blur">{STATUS_LABEL[r.status]}</span>}
                </Link>
                <Link href={`/anime/${r.mal_id}`} className="line-clamp-2 px-1 text-[13.5px] font-extrabold leading-tight hover:text-frost-text">{r.title}</Link>
                {r.kind !== "Movie" && (
                  <div className="mt-auto flex items-center gap-2 px-1">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-tint"><div className="h-full rounded-full bg-frost-hot" style={{ width: `${Math.max(pct, r.progress ? 4 : 0)}%` }} /></div>
                    <span className="font-mono text-[11px] text-plum-muted">{r.progress}/{r.episodes ?? "?"}</span>
                    {!readOnly && r.status === "watching" && (
                      <button type="button" aria-label="Watched one more" onClick={() => saveEntry({ id: r.mal_id, title: r.title, poster: r.image, episodes: r.episodes, format: r.kind ?? "TV" }, { progress: r.progress + 1, ...(r.episodes && r.progress + 1 >= r.episodes ? { status: "completed" as const } : {}) })}
                        className="grid size-7 place-items-center rounded-full border-1.5 border-line hover:border-frost-hot hover:text-frost-text"><Plus className="size-3.5" strokeWidth={2.8} /></button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
