"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Countdown } from "@/components/countdown";
import { Poster } from "@/components/poster";
import { cn } from "@/lib/utils";

export interface Slot { id: number; title: string; poster: string | null; color: string; at: number; ep: number | null }

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

export function FreshSchedule({ items }: { items: Slot[] }) {
  const [day, setDay] = useState(0);
  const [now, setNow] = useState<number | null>(null); // client-only: the viewer's time zone
  useEffect(() => setNow(Date.now()), []);

  const days = useMemo(() => {
    const t = startOfDay(now ? new Date(now) : new Date());
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(t); d.setDate(d.getDate() + i); return d; });
  }, [now]);
  const lo = days[day].getTime() / 1000;
  const slots = items.filter((s) => s.at >= lo && s.at < lo + 86400).sort((a, b) => a.at - b.at);

  return (
    <section id="oven" aria-labelledby="oven-h" className="scroll-mt-[120px] rounded-box border-1.5 border-line bg-cream-card p-[22px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Weekly lineup · your time zone</div>
          <h2 id="oven-h" className="mt-1 text-xl font-extrabold tracking-[-.6px]">Fresh out the oven</h2>
        </div>
        <div role="tablist" aria-label="day" className="flex flex-wrap gap-1">
          {days.map((d, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === day} onClick={() => setDay(i)}
              className={cn("flex h-14 w-[50px] flex-col items-center justify-center rounded-2xl border-1.5 border-line bg-paper hover:border-frost-hot", i === day && "border-frost-hot bg-frost text-frost-ink")}>
              <span className="text-[10.5px] font-bold uppercase tracking-[.06em]">{i === 0 ? "Today" : d.toLocaleDateString("en", { weekday: "short" })}</span>
              <span className="text-[17px] font-extrabold leading-tight">{d.getDate()}</span>
            </button>
          ))}
        </div>
      </div>
      {now === null ? (
        <div className="h-32 rounded-2xl skeleton" />
      ) : slots.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-2">
          {slots.map((s) => {
            const aired = s.at * 1000 < now;
            return (
              <Link key={s.id} href={`/anime/${s.id}`} className="grid grid-cols-[56px_38px_1fr_auto] items-center gap-3 rounded-2xl border-1.5 border-line-soft bg-paper py-[7px] pl-[7px] pr-3 transition hover:border-frost-hot">
                <span className={cn("text-center font-mono text-[12.5px]", aired ? "text-frost-text" : "text-plum-muted")}>
                  {new Date(s.at * 1000).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "")}
                </span>
                <Poster src={s.poster} color={s.color} className="h-[52px] w-[38px] rounded-[9px]" />
                <span className="min-w-0">
                  <span className="line-clamp-2 text-[13.5px] font-bold leading-tight">{s.title}</span>
                  {!aired && <Countdown at={s.at} compact className="text-[11px] text-plum-muted" />}
                </span>
                <span className={cn("flex h-6 items-center whitespace-nowrap rounded-full px-[9px] text-[11.5px] font-extrabold", aired ? "bg-frost-hot text-white" : "bg-cream-tint text-plum-muted")}>
                  {s.ep ? `EP ${s.ep}` : "New"}{aired ? "" : " soon"}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="py-7 text-center text-plum-muted">Nothing baking this day.</p>
      )}
      <div className="mt-4 text-center">
        <Link href="/schedule" className="text-[12.5px] font-bold text-frost-text hover:text-frost-deep">Full schedule with timers →</Link>
      </div>
    </section>
  );
}
