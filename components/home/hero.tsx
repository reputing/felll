"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Info, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/banner";
import { Poster } from "@/components/poster";
import { episodesLabel, formatLabel, type Anime } from "@/lib/jikan";
import { actions, useBox } from "@/lib/store";
import { refOf } from "@/lib/anime-ref";
import { cn } from "@/lib/utils";

const DURATION = 8000;

export function Hero({ items }: { items: Anime[] }) {
  const [i, setI] = useState(0);
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const saved = useBox((s) => s.lib);
  const a = items[i];

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setI((x) => (x + 1) % items.length), DURATION);
    return () => clearTimeout(t);
  }, [i, tick, items.length, paused]);

  if (!a) return null;
  const on = !!saved[a.id]?.status;

  return (
    <section aria-label="this week's pick" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      className="relative overflow-hidden rounded-shell border-1.5 border-night-line bg-night text-night-text shadow-[0_30px_50px_-36px_rgba(0,0,0,.8)]">
      <div aria-hidden className="absolute inset-0" style={{ background: a.color }}>
        <Banner key={a.id} src={a.banner} fallback={a.poster} eager={i === 0} />
      </div>
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,var(--night)_0%,color-mix(in_srgb,var(--night)_90%,transparent)_36%,color-mix(in_srgb,var(--night)_15%,transparent)_80%),linear-gradient(0deg,var(--night)_0%,transparent_55%)]" />
      <div className="relative flex min-h-[340px] max-w-[640px] flex-col justify-end gap-3 px-6 pb-[22px] pt-8 sm:px-[34px]">
        <div key={`k${a.id}`} className="text-[10.5px] font-bold uppercase tracking-[.14em] text-frost animate-in fade-in slide-in-from-bottom-1">This week’s pick · #{i + 1} airing now</div>
        <h2 key={`t${a.id}`} className="text-balance text-[clamp(30px,3.6vw,46px)] font-extrabold leading-[1.02] tracking-[-1.6px] animate-in fade-in slide-in-from-bottom-2 duration-500">{a.title}</h2>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="night" className="text-[#ffd98a]">★ {a.score}</Badge>
          <Badge variant="night">{formatLabel(a)}</Badge>
          <Badge variant="night">{episodesLabel(a)}</Badge>
          {a.studio && <Badge variant="night">{a.studio}</Badge>}
          {a.genres.slice(0, 2).map((g) => <Badge key={g} variant="night" className="text-[#a8ecd6]">{g}</Badge>)}
        </div>
        <p className="line-clamp-2 text-pretty text-[14.5px] leading-relaxed text-night-muted">{a.description}</p>
        <div className="mt-1 flex flex-wrap gap-2.5">
          <Button size="lg" asChild className="pl-[18px] font-extrabold">
            <Link href={`/watch/${a.id}/1`}><Play className="size-4" fill="currentColor" />Watch episode 1</Link>
          </Button>
          <Button size="lg" variant="night" aria-pressed={on} onClick={() => actions.toggleSave(refOf(a))}>{on ? "✓ In your box" : "+ Add to my box"}</Button>
          <Button size="lg" variant="night" asChild className="px-4"><Link href={`/anime/${a.id}`} aria-label={`About ${a.title}`}><Info className="size-4" /></Link></Button>
        </div>
      </div>
      <div role="tablist" aria-label="featured" className="scrollbar-none relative flex gap-1.5 overflow-x-auto px-[18px] pb-[18px]">
        {items.map((m, n) => (
          <button key={m.id} type="button" role="tab" aria-selected={n === i} onClick={() => { setI(n); setTick((t) => t + 1); }}
            className={cn("relative grid min-w-[150px] flex-1 grid-cols-[34px_1fr] items-center gap-2.5 overflow-hidden rounded-2xl border-1.5 border-transparent bg-night/55 py-[7px] pl-[7px] pr-2.5 text-left backdrop-blur-md transition hover:bg-night-line/85", n === i && "border-night-edge bg-night-line/90")}>
            <Poster src={m.posterSm} color={m.color} className="h-[46px] w-[34px] rounded-[9px]" />
            <span className="line-clamp-2 text-[12.5px] font-bold leading-tight">{m.title}</span>
            {n === i && <span key={`${i}-${tick}-${paused}`} aria-hidden className={cn("absolute inset-x-2.5 bottom-[3px] h-[3px] origin-left rounded-full bg-frost", !paused && "animate-fill")} style={{ ["--dur" as string]: DURATION + "ms" }} />}
          </button>
        ))}
      </div>
    </section>
  );
}
