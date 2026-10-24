"use client";
import Link from "next/link";
import { ArrowRight, ChevronRight, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SaveIcon } from "@/components/icons";
import { Poster } from "@/components/poster";
import { TrailerButton } from "@/components/trailer";
import { formatLabel, type Anime } from "@/lib/jikan";
import { actions, useBox } from "@/lib/store";
import { refOf } from "@/lib/anime-ref";
import { cn } from "@/lib/utils";

export function CloserLook({ pool }: { pool: Anime[] }) {
  const sel = useBox((s) => s.sel);
  // Default to a title past the hero's rotation (it features the first few), so
  // nothing selected doesn't just mirror the hero.
  const a = pool.find((m) => m.id === sel) ?? pool[6] ?? pool[0];
  const saved = useBox((s) => (a ? !!s.lib[a.id]?.status : false));
  if (!a) return null;
  const alt = a.native && a.romaji !== a.title ? a.romaji : a.native || a.romaji;
  const season = a.season ? `${a.season[0].toUpperCase()}${a.season.slice(1)} ${a.year ?? ""}` : String(a.year ?? "-");
  const stats = [
    { k: "Studio", v: a.studio || "-" },
    { k: a.group === "film" ? "Format" : "Episodes", v: a.group === "film" ? "Film" : a.episodes ?? "Airing" },
    { k: "Season", v: season },
  ];

  return (
    <section aria-labelledby="cl" aria-live="polite" className="flex flex-col gap-3.5 rounded-box border-1.5 border-line bg-cream-card px-[18px] pb-4 pt-5">
      <div className="flex items-center justify-between border-b-1.5 border-line-soft pb-3">
        <h2 id="cl" className="text-[19px] font-extrabold tracking-[-.5px] text-frost-deep">A closer look</h2>
        <span aria-hidden className="size-2 rounded-full bg-frost-hot shadow-halo" />
      </div>
      <div className="eyebrow flex justify-between tracking-[.12em]"><span>Series preview</span><span>{formatLabel(a)}{a.year ? ` / ${a.year}` : ""}</span></div>
      <div className="relative aspect-square overflow-hidden rounded-[20px] border-1.5 border-line">
        <Poster key={a.id} src={a.poster} color={a.color} className="absolute inset-0 animate-in fade-in duration-300 [&>img]:object-[center_20%]" />
        <Badge variant="paper" className="absolute bottom-2.5 right-2.5 h-[30px] px-2.5 text-[13px] font-extrabold"><span className="text-sprinkle-star">★</span>{a.score}</Badge>
        {a.rank && <Badge variant="paper" className="absolute bottom-2.5 left-2.5 h-[30px] px-2.5 text-[12px] font-extrabold">#{a.rank} on MAL</Badge>}
      </div>
      <div className="grid grid-cols-[1fr_40px] items-start gap-2.5">
        <div className="min-w-0">
          <h3 className="text-balance text-[23px] font-extrabold leading-[1.1] tracking-[-.8px] text-frost-deep">{a.title}</h3>
          <div className="mt-1 text-[12.5px] font-medium text-plum-muted">{alt}</div>
        </div>
        <button type="button" aria-pressed={saved} aria-label={`${saved ? "Remove" : "Save"} ${a.title}`} onClick={() => actions.toggleSave(refOf(a))}
          className={cn("grid size-10 place-items-center rounded-full border-1.5 border-line bg-paper hover:border-frost-hot", saved && "border-frost-hot bg-frost-hot text-white")}>
          <SaveIcon on={saved} className="size-4" />
        </button>
      </div>
      <dl className="grid grid-cols-3 gap-2.5 border-y-1.5 border-line-soft py-3">
        {stats.map((s) => (
          <div key={s.k} className="min-w-0">
            <dt className="text-[9.5px] font-bold uppercase tracking-[.12em] text-plum-muted">{s.k}</dt>
            <dd className="mt-1 truncate text-[13px] font-extrabold">{s.v}</dd>
          </div>
        ))}
      </dl>
      <p className="line-clamp-4 text-pretty text-[13.5px] leading-relaxed text-plum-body">{a.description || "No synopsis yet."}</p>
      <div className="flex flex-wrap gap-1.5">{[...a.genres, ...a.themes].slice(0, 4).map((g) => <Badge key={g} variant="outline">{g}</Badge>)}</div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button size="block" className="font-extrabold" asChild>
          <Link href={`/watch/${a.id}/1`}><Play className="size-4" fill="currentColor" />Watch now</Link>
        </Button>
        <Button size="block" variant={saved ? "soft" : "outline"} className="w-[50px] px-0" aria-label={saved ? "In your box" : "Add to my box"} onClick={() => actions.toggleSave(refOf(a))}>
          <SaveIcon on={saved} className="size-4" />
        </Button>
      </div>
      {a.trailer ? (
        <TrailerButton id={a.trailer} title={a.title}>
          <Button variant="outline" className="h-11 justify-between rounded-[14px] px-3.5 text-[13px]">
            <Play className="size-3 fill-frost-hot text-frost-hot" />Watch trailer<ArrowRight className="size-3.5" strokeWidth={2.4} />
          </Button>
        </TrailerButton>
      ) : (
        <Button variant="outline" disabled className="h-11 rounded-[14px] text-[13px]">No trailer yet</Button>
      )}
      <Link href={`/anime/${a.id}`} className="flex items-center gap-1 self-center text-[12.5px] font-bold text-frost-text hover:text-frost-deep">
        Full series details <ChevronRight className="size-3" strokeWidth={2.6} />
      </Link>
    </section>
  );
}
