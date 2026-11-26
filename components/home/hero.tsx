"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Info, Play, Plus, Check } from "lucide-react";
import { Banner } from "@/components/banner";
import { Poster } from "@/components/poster";
import { episodesLabel, formatLabel, type Anime } from "@/lib/jikan";
import { actions, useBox } from "@/lib/store";
import { refOf } from "@/lib/anime-ref";
import { cn } from "@/lib/utils";

const DURATION = 8000;

// The featured show: its art fills the frame, with a dark glass panel for the details (always dark, whatever the skin, because it
// sits on a picture). A phone gets a tall frame you can swipe; from lg up the other picks line up on the right as an "up next" list.
export function Hero({ items }: { items: Anime[] }) {
  const [i, setI] = useState(0);
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const saved = useBox((s) => s.lib);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const a = items[i];

  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setTimeout(() => setI((x) => (x + 1) % items.length), DURATION);
    return () => clearTimeout(t);
  }, [i, tick, items.length, paused]);

  if (!a) return null;
  const on = !!saved[a.id]?.status;
  const go = (n: number) => { setI((n + items.length) % items.length); setTick((t) => t + 1); };

  return (
    <section aria-label="this week's pick" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; setPaused(true); }}
      onTouchEnd={(e) => {
        const s = touch.current; touch.current = null; setPaused(false);
        if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) go(i + (dx < 0 ? 1 : -1));
      }}
      className="relative isolate overflow-hidden rounded-shell border border-[var(--glass-line)] bg-night text-night-text shadow-[var(--glass-shadow)]">
      <div aria-hidden className="absolute inset-0" style={{ background: a.color }}>
        <Banner key={a.id} src={a.banner} fallback={a.poster} eager={i === 0} />
      </div>
      {!a.banner && a.poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`p${a.id}`} src={a.poster} alt="" aria-hidden referrerPolicy="no-referrer" decoding="async"
          className="absolute right-1/2 top-5 h-[48%] translate-x-1/2 rounded-[22px] border border-white/20 object-cover shadow-[0_30px_60px_-20px_rgb(0_0_0/.8)] animate-in fade-in zoom-in-95 duration-700 sm:top-6 sm:h-[60%] lg:right-[330px] lg:top-1/2 lg:h-[78%] lg:-translate-y-1/2 lg:translate-x-0 lg:rotate-[3deg]" />
      )}
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(0deg,rgb(0_0_0/.78)_0%,rgb(0_0_0/.25)_52%,transparent_80%)] lg:bg-[linear-gradient(90deg,rgb(0_0_0/.72)_0%,rgb(0_0_0/.3)_48%,transparent_85%)]" />
      <div className="relative grid min-h-[500px] items-end gap-6 p-3 sm:min-h-[440px] sm:p-5 lg:grid-cols-[minmax(0,600px)_1fr] lg:p-7">
        <div className="beam rounded-[26px] border border-white/15 bg-black/40 p-5 shadow-[inset_0_1px_0_rgb(255_255_255/.18)] backdrop-blur-2xl sm:p-6">
          <div key={`m${a.id}`} className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-extrabold animate-in fade-in slide-in-from-bottom-2 duration-500">
            <span className="rounded-full bg-[#ffd98a]/15 px-2.5 py-1 text-[#ffd98a]">★ {a.score}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1">{formatLabel(a)}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1">{episodesLabel(a)}</span>
            {a.genres[0] && <span className="rounded-full bg-white/10 px-2.5 py-1">{a.genres[0]}</span>}
          </div>
          <h2 key={`t${a.id}`} className="mt-3 text-balance text-[clamp(28px,4.2vw,46px)] font-extrabold leading-[1.02] tracking-[-1.6px] animate-in fade-in slide-in-from-bottom-2 duration-500">{a.title}</h2>
          <p className="mt-2.5 line-clamp-3 max-w-[520px] text-pretty text-[14px] leading-relaxed text-white/75 sm:line-clamp-2">{a.description}</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link href={`/watch/${a.id}/1`} className="inline-flex h-12 items-center gap-2 rounded-full bg-frost px-6 text-[15px] font-extrabold text-frost-ink shadow-[0_10px_26px_-8px_rgb(var(--glow)/.9)] transition hover:brightness-105 active:scale-[.97]">
              <Play className="size-4" fill="currentColor" />Play
            </Link>
            <button type="button" aria-pressed={on} onClick={() => actions.toggleSave(refOf(a))}
              className="inline-flex h-12 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 text-[14px] font-extrabold backdrop-blur transition hover:bg-white/20 active:scale-[.97]">
              {on ? <><Check className="size-4" />In your box</> : <><Plus className="size-4" />My box</>}
            </button>
            <Link href={`/anime/${a.id}`} aria-label={`About ${a.title}`} className="grid size-12 place-items-center rounded-full border border-white/20 bg-white/10 backdrop-blur transition hover:bg-white/20"><Info className="size-[18px]" /></Link>
          </div>
          <div role="tablist" aria-label="featured" className="mt-5 flex items-center gap-2">
            {items.map((m, n) => (
              <button key={m.id} type="button" role="tab" aria-selected={n === i} aria-label={m.title} onClick={() => go(n)}
                className={cn("relative h-1.5 overflow-hidden rounded-full transition-all", n === i ? "w-8 bg-white/25" : "w-3 bg-white/20 hover:bg-white/40")}>
                {n === i && <span key={`${i}-${tick}-${paused}`} aria-hidden className={cn("absolute inset-y-0 left-0 w-full origin-left rounded-full bg-frost", !paused && "animate-fill")} style={{ ["--dur" as string]: DURATION + "ms" }} />}
              </button>
            ))}
          </div>
        </div>
        {items.length > 1 && (
          <aside aria-label="up next" className="hidden w-[272px] flex-col gap-2 justify-self-end lg:flex">
            <div className="px-1 text-[10.5px] font-extrabold uppercase tracking-[.14em] text-white/60">Up next</div>
            {items.map((m, n) => (
              <button key={m.id} type="button" onClick={() => go(n)} aria-current={n === i}
                className={cn("flex items-center gap-3 rounded-2xl border p-2 text-left backdrop-blur-xl transition", n === i ? "border-frost bg-white/20" : "border-white/10 bg-black/35 hover:bg-white/15")}>
                <Poster src={m.posterSm} className="h-[58px] w-10 flex-none rounded-lg" />
                <span className="min-w-0">
                  <span className="line-clamp-1 text-[13px] font-extrabold">{m.title}</span>
                  <span className="text-[11.5px] font-bold text-white/60">★ {m.score} · {formatLabel(m)}</span>
                </span>
              </button>
            ))}
          </aside>
        )}
      </div>
    </section>
  );
}
