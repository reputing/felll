"use client";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PosterCard } from "@/components/poster-card";
import type { Anime } from "@/lib/jikan";
import { actions, set, useBox, type Sort } from "@/lib/store";
import { useCatalog } from "@/lib/use-catalog";
import { cn, pad2 } from "@/lib/utils";

const PILLS = [{ v: "all", label: "All titles" }, { v: "tv", label: "TV series" }, { v: "film", label: "Films" }] as const;

export function Catalog({ pool }: { pool: Anime[] }) {
  const { list, selected } = useCatalog(pool);
  const fmt = useBox((s) => s.fmt), sort = useBox((s) => s.sort), genres = useBox((s) => s.genres);
  const q = useBox((s) => s.q), savedOnly = useBox((s) => s.savedOnly), limit = useBox((s) => s.limit);
  const shown = list.slice(0, limit);

  const chips = [
    ...genres.map((g) => ({ key: g, label: g, aria: `Remove ${g} filter`, remove: () => actions.toggleGenre(g) })),
    ...(q.trim() ? [{ key: "q", label: `“${q.trim()}”`, aria: "Clear filter", remove: () => set({ q: "" }) }] : []),
    ...(savedOnly ? [{ key: "box", label: "My watch box", aria: "Show all titles", remove: () => set({ savedOnly: false }) }] : []),
  ];

  return (
    <section aria-labelledby="cat" className="flex flex-col gap-3.5">
      <div className="flex items-end justify-between gap-4 px-1">
        <div>
          <div className="eyebrow">Cupcake / the collection</div>
          <h2 id="cat" className="mb-1 mt-1.5 text-[clamp(34px,4vw,50px)] font-extrabold leading-none tracking-[-2px] text-frost-text">the watch box<span className="text-frost">.</span></h2>
          <p className="font-medium text-plum-muted">A place for every anime on your list.</p>
        </div>
        <div aria-label={`${list.length} titles`} className="flex size-16 flex-none flex-col items-center justify-center rounded-[20px] border-1.5 border-line bg-cream-card">
          <span className="font-mono text-[22px] font-medium leading-none text-frost-text">{pad2(list.length)}</span>
          <span className="mt-1 text-[8.5px] font-extrabold tracking-[.14em] text-plum-muted">TITLES</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PILLS.map((p) => (
          <button key={p.v} type="button" aria-pressed={fmt === p.v} onClick={() => set({ fmt: p.v })}
            className={cn("h-[42px] rounded-full border-1.5 border-line bg-cream-card px-5 text-[13.5px] font-bold hover:border-frost-hot", fmt === p.v && "border-frost-hot bg-frost text-frost-ink shadow-[inset_0_-3px_0_var(--frost-hot),0_0_0_3px_var(--cream-blush)]")}>
            {p.label}
          </button>
        ))}
        <input value={q} onChange={(e) => set({ q: e.target.value })} placeholder="Filter this box…" aria-label="Filter titles"
          className="h-[42px] w-[170px] rounded-full border-1.5 border-line bg-cream-card px-4 text-[13.5px] font-semibold outline-none focus:border-frost-hot" />
        <div className="flex-1" />
        <Select value={sort} onValueChange={(v) => set({ sort: v as Sort })}>
          <SelectTrigger aria-label="Sort by"><SelectValue /></SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="rec">Recommended</SelectItem>
            <SelectItem value="score">Top rated</SelectItem>
            <SelectItem value="members">Most popular</SelectItem>
            <SelectItem value="az">A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {chips.length > 0 && (
        <div className="-mt-1 flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={c.remove} aria-label={c.aria} className="flex h-8 items-center gap-2 rounded-full border-1.5 border-line-hot bg-cream-blush pl-3.5 pr-2.5 text-[12.5px] font-bold text-frost-deep hover:border-frost-hot">
              {c.label}<X className="size-3.5" strokeWidth={2.8} />
            </button>
          ))}
          <button type="button" onClick={actions.clear} className="h-8 px-2.5 text-[12.5px] font-bold text-plum-muted underline underline-offset-[3px] hover:text-frost-text">Clear all</button>
        </div>
      )}

      {shown.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
          {shown.map((m) => <PosterCard key={m.id} a={m} selected={m.id === selected?.id} preview />)}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2.5 rounded-3xl border-1.5 border-dashed border-line bg-cream-card px-5 py-12 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={56} height={56} className="rounded-2xl bg-paper" />
          <p className="text-base font-extrabold">Nothing in this box yet.</p>
          <Button variant="outline" size="sm" className="rounded-full px-[18px]" onClick={actions.clear}>Clear filters</Button>
        </div>
      )}
      {list.length > limit && (
        <Button variant="outline" className="self-center bg-cream-card" onClick={() => set((s) => ({ limit: s.limit + 12 }))}>
          Show more · {list.length - limit} left
        </Button>
      )}
    </section>
  );
}
