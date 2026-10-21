"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Countdown } from "@/components/countdown";
import { SaveIcon } from "@/components/icons";
import { Poster } from "@/components/poster";
import { useBox } from "@/lib/store";
import { cn } from "@/lib/utils";

export interface Airing { id: number; title: string; poster: string | null; color: string; at: number; ep: number | null; episodes: number | null; studio: string; score: string }

const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

export function ScheduleBoard({ items }: { items: Airing[] }) {
  const [now, setNow] = useState<number | null>(null);
  const [day, setDay] = useState(0);
  const [mine, setMine] = useState(false);
  const lib = useBox((s) => s.lib);
  useEffect(() => setNow(Date.now()), []);

  const days = useMemo(() => {
    const t = dayStart(now ? new Date(now) : new Date());
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(t); d.setDate(d.getDate() + i); return d; });
  }, [now]);

  // every show airs weekly, so place each one on each of the next 7 local days it falls on
  const slots = useMemo(() => {
    if (!now) return [];
    const lo = days[0].getTime() / 1000, hi = lo + 7 * 86400;
    return items.flatMap((a) => {
      const out: Airing[] = [];
      for (let at = a.at - 7 * 86400, k = -1; at < hi; at += 7 * 86400, k++) {
        if (at >= lo) out.push({ ...a, at, ep: a.ep != null ? a.ep + k : null });
      }
      return out;
    }).filter((s) => !mine || lib[s.id]?.status);
  }, [items, days, now, mine, lib]);

  if (now === null) return <div className="h-[480px] rounded-box skeleton" />;
  const lo = days[day].getTime() / 1000;
  const today = slots.filter((s) => s.at >= lo && s.at < lo + 86400).sort((a, b) => a.at - b.at);
  const nextUp = today.findIndex((s) => s.at * 1000 > now);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="day" className="scrollbar-none flex gap-1.5 overflow-x-auto">
          {days.map((d, i) => {
            const n = slots.filter((s) => s.at >= d.getTime() / 1000 && s.at < d.getTime() / 1000 + 86400).length;
            return (
              <button key={i} type="button" role="tab" aria-selected={i === day} onClick={() => setDay(i)}
                className={cn("flex h-[68px] w-[74px] flex-none flex-col items-center justify-center rounded-2xl border-1.5 border-line bg-cream-card hover:border-frost-hot", i === day && "border-frost-hot bg-frost text-frost-ink")}>
                <span className="text-[10.5px] font-bold uppercase tracking-[.08em]">{i === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                <span className="text-[20px] font-extrabold leading-tight">{d.getDate()}</span>
                <span className="text-[10px] font-bold opacity-70">{n} shows</span>
              </button>
            );
          })}
        </div>
        <span className="flex-1" />
        <button type="button" aria-pressed={mine} onClick={() => setMine(!mine)}
          className={cn("flex h-10 items-center gap-2 rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold hover:border-frost-hot", mine && "border-frost-hot bg-cream-blush text-frost-deep")}>
          <SaveIcon on={mine} className="size-4" /> Only my box
        </button>
      </div>

      {today.length === 0 ? (
        <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">Nothing airing this day{mine ? " from your box" : ""}.</p>
      ) : (
        <ol className="relative flex flex-col gap-2 before:absolute before:bottom-4 before:left-[79px] before:top-4 before:w-[1.5px] before:bg-line">
          {today.map((s, i) => {
            const aired = s.at * 1000 <= now;
            const isNext = i === nextUp;
            return (
              <li key={`${s.id}-${s.at}`} className="relative grid grid-cols-[68px_24px_1fr] items-center gap-0">
                <span className={cn("whitespace-nowrap text-right font-mono text-[12.5px]", aired ? "text-plum-faint" : "text-plum")}>
                  {new Date(s.at * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </span>
                <span className={cn("relative z-10 mx-auto size-3 rounded-full border-2 border-cream", aired ? "bg-plum-faint" : isNext ? "bg-frost-hot animate-pulse-dot" : "bg-line-hot")} />
                <Link href={`/anime/${s.id}`} className={cn("grid grid-cols-[46px_1fr_auto] items-center gap-3 rounded-2xl border-1.5 bg-cream-card p-2 pr-4 transition hover:border-frost-hot", isNext ? "border-frost-hot shadow-halo" : "border-line", aired && "opacity-70")}>
                  <Poster src={s.poster} color={s.color} className="h-[62px] w-[46px] rounded-xl" />
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-extrabold">{s.title}</span>
                    <span className="text-[12px] font-semibold text-plum-muted">{s.ep ? `Episode ${s.ep}${s.episodes ? ` of ${s.episodes}` : ""}` : "New episode"} · {s.studio} · ★ {s.score}</span>
                  </span>
                  {aired ? (
                    <span className="rounded-full bg-frost-hot px-3 py-1 text-[11.5px] font-extrabold text-white">Out now</span>
                  ) : (
                    <span className="flex flex-col items-end">
                      <span className="text-[10px] font-bold uppercase tracking-[.1em] text-plum-muted">{isNext ? "Up next" : "Drops in"}</span>
                      <Countdown at={s.at} compact={!isNext} className={cn("text-[14px]", isNext ? "text-frost-text" : "text-plum-body")} />
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
