"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SaveIcon } from "@/components/icons";
import { Poster } from "@/components/poster";
import { formatLabel, type Anime } from "@/lib/jikan";
import { actions, set, useBox } from "@/lib/store";
import { refOf } from "@/lib/anime-ref";
import { cn } from "@/lib/utils";

/** The cupcake card: poster on a checkerboard plate. With `preview`, clicking selects it for the closer-look panel instead of navigating. */
export function PosterCard({ a, selected, preview, extra, rank }: { a: Anime; selected?: boolean; preview?: boolean; extra?: React.ReactNode; rank?: number }) {
  const saved = useBox((s) => !!s.lib[a.id]?.status);
  const mine = useBox((s) => s.lib[a.id]?.score);
  const sub = [a.studio, a.group === "film" ? "" : a.episodes ? `${a.episodes} episodes` : a.airing ? "Airing" : ""].filter(Boolean).join(" · ") || a.romaji;
  const plate = (
    <>
      <span className="absolute inset-y-2.5 left-1/2 aspect-[2/3] -translate-x-1/2 overflow-hidden rounded-[10px] shadow-poster transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-[1.03]">
        <Poster src={a.poster} color={a.color} sizes="160px" className="size-full" />
      </span>
      {selected && <Badge size="sm" className="absolute left-2 top-2 rounded-[7px] font-extrabold">In preview</Badge>}
      {rank != null && <span className="absolute left-2 top-2 grid size-8 place-items-center rounded-xl bg-night/85 font-mono text-[14px] font-medium text-night-text backdrop-blur">{rank}</span>}
      <Badge variant="tag" size="xs" className="absolute bottom-2 right-2">{formatLabel(a).toUpperCase()}</Badge>
      {mine ? <Badge size="xs" className="absolute bottom-2 left-2 rounded-md px-1.5 text-[10px]">you ★ {mine}</Badge> : null}
    </>
  );
  const plateClass = "group relative block aspect-[5/4] overflow-hidden rounded-[17px] bg-checker";
  return (
    <article className={cn("spotlight flex flex-col gap-2.5 rounded-3xl border-1.5 border-line bg-cream-card px-2 pb-2.5 pt-2 transition-[border-color,box-shadow,transform] hover:border-line-hot", selected && "border-frost-hot shadow-halo")}>
      {preview ? (
        <button type="button" onClick={() => set({ sel: a.id })} aria-label={`Preview ${a.title}`} className={plateClass}>{plate}</button>
      ) : (
        <Link href={`/anime/${a.id}`} aria-label={a.title} className={plateClass}>{plate}</Link>
      )}
      <div className="flex min-w-0 flex-col gap-[3px] px-1.5">
        <div className="flex justify-between gap-2 text-[11.5px] font-semibold text-plum-muted">
          <span className="truncate">{a.genres[0] ?? "Anime"}{a.year ? ` / ${a.year}` : ""}</span>
          <span className="flex-none font-bold text-plum"><span className="text-sprinkle-star">★</span> {a.score}</span>
        </div>
        <h3 className="mt-0.5 truncate text-base font-extrabold leading-tight tracking-[-.4px]" title={a.title}>{a.title}</h3>
        <div className="truncate text-xs font-medium text-plum-muted">{sub}</div>
        {extra}
      </div>
      <div className="mt-0.5 grid grid-cols-[1fr_36px] gap-1.5">
        {preview ? (
          <Button variant="outline" size="sm" onClick={() => set({ sel: a.id })}>View series <ArrowRight className="size-3.5" strokeWidth={2.4} /></Button>
        ) : (
          <Button variant="outline" size="sm" asChild><Link href={`/anime/${a.id}`}>View series <ArrowRight className="size-3.5" strokeWidth={2.4} /></Link></Button>
        )}
        <Button variant="outline" size="icon" aria-pressed={saved} aria-label={`${saved ? "Remove" : "Save"} ${a.title}`} onClick={() => actions.toggleSave(refOf(a))}
          className={cn(saved && "border-frost-hot bg-frost-hot text-white hover:text-white")}>
          <SaveIcon on={saved} className="size-[15px]" />
        </Button>
      </div>
    </article>
  );
}
