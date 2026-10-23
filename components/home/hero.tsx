"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Info, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/banner";
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
      className="relative overflow-hidden rounded-shell border-1.5 border-night-line bg-night text-night-text">
      <div aria-hidden className="absolute inset-0" style={{ background: a.color }}>
        <Banner key={a.id} src={a.banner} fallback={a.poster} eager={i === 0} />
      </div>
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,var(--night)_0%,color-mix(in_srgb,var(--night)_88%,transparent)_38%,color-mix(in_srgb,var(--night)_10%,transparent)_82%),linear-gradient(0deg,var(--night)_2%,transparent_52%)]" />
      <div className="relative flex min-h-[320px] max-w-[600px] flex-col justify-end gap-2.5 px-6 pb-7 pt-9 sm:px-[34px]">
        <h2 key={`t${a.id}`} className="text-balance text-[clamp(30px,3.6vw,46px)] font-extrabold leading-[1.02] tracking-[-1.6px] animate-in fade-in slide-in-from-bottom-2 duration-500">{a.title}</h2>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] font-bold text-night-muted">
          <span className="text-[#ffd98a]">★ {a.score}</span>
          <span aria-hidden className="text-night-line">•</span><span>{formatLabel(a)}</span>
          <span aria-hidden className="text-night-line">•</span><span>{episodesLabel(a)}</span>
          {a.genres[0] && <><span aria-hidden className="text-night-line">•</span><span>{a.genres[0]}</span></>}
        </div>
        <p className="line-clamp-2 max-w-[520px] text-pretty text-[14px] leading-relaxed text-night-muted">{a.description}</p>
        <div className="mt-2 flex flex-wrap gap-2.5">
          <Button size="lg" asChild className="pl-[18px] font-extrabold">
            <Link href={`/watch/${a.id}/1`}><Play className="size-4" fill="currentColor" />Play</Link>
          </Button>
          <Button size="lg" variant="night" aria-pressed={on} onClick={() => actions.toggleSave(refOf(a))}>{on ? "✓ In your box" : "+ My box"}</Button>
          <Button size="lg" variant="night" asChild className="px-4"><Link href={`/anime/${a.id}`} aria-label={`About ${a.title}`}><Info className="size-4" /></Link></Button>
        </div>
        <div role="tablist" aria-label="featured" className="mt-3 flex items-center gap-2">
          {items.map((m, n) => (
            <button key={m.id} type="button" role="tab" aria-selected={n === i} aria-label={m.title} onClick={() => { setI(n); setTick((t) => t + 1); }}
              className={cn("relative h-1.5 overflow-hidden rounded-full transition-all", n === i ? "w-7 bg-night-line/70" : "w-3 bg-night-line/50 hover:bg-night-line/80")}>
              {n === i && <span key={`${i}-${tick}-${paused}`} aria-hidden className={cn("absolute inset-y-0 left-0 w-full origin-left rounded-full bg-frost", !paused && "animate-fill")} style={{ ["--dur" as string]: DURATION + "ms" }} />}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
