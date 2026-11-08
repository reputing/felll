"use client";
import { useMemo, useState } from "react";
import { Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";

// How long is it going to take? Total watch time for what's left on your list (or one show),
// and the day you'd finish at N episodes a day or N hours a day. Runtimes come from the catalog
// where it has them (24 min is assumed otherwise), so treat the answer as an estimate.

export interface BingeItem { id: number; title: string; status: string | null; episodes: number | null; progress: number; minutes: number; movie: boolean }

const fmt = (min: number) => {
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = Math.round(min % 60);
  return [d && `${d}d`, (h || d) && `${h}h`, `${m}m`].filter(Boolean).join(" ");
};
const dayLabel = (d: Date) => d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

const GROUPS: { key: string; label: string }[] = [
  { key: "watching", label: "Watching" }, { key: "planning", label: "Plan to watch" }, { key: "paused", label: "On hold" }, { key: "completed", label: "Completed (rewatch)" },
];

export function BingeClock({ items, solo }: { items: BingeItem[]; solo?: boolean }) {
  const [pick, setPick] = useState<Set<string>>(new Set(["watching", "planning"]));
  const [mode, setMode] = useState<"eps" | "hours">("hours");
  const [per, setPer] = useState(2);

  const rows = useMemo(() => items.filter((i) => solo || (i.status && pick.has(i.status))).map((i) => {
    const total = i.movie ? 1 : i.episodes ?? 0;
    // a finished show you're counting for a rewatch is all of it, otherwise what's left
    const left = i.status === "completed" ? total : Math.max(0, total - i.progress);
    return { ...i, left, minutes: left * i.minutes, unknown: !i.movie && !i.episodes };
  }), [items, pick, solo]);
  const totalMin = rows.reduce((s, r) => s + r.minutes, 0);
  const unknown = rows.filter((r) => r.unknown).length;
  const avg = rows.length ? totalMin / Math.max(1, rows.reduce((s, r) => s + r.left, 0)) : 24;
  const perDayMin = mode === "hours" ? per * 60 : per * avg;
  const days = perDayMin > 0 ? Math.ceil(totalMin / perDayMin) : 0;
  const done = new Date(Date.now() + days * 86400_000);

  return (
    <section className="rounded-box border-1.5 border-line bg-cream-card p-5" aria-label="Binge clock">
      <div className="flex items-center gap-2"><Hourglass className="size-4 text-frost-hot" /><div className="eyebrow">Binge clock</div></div>
      {!solo && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {GROUPS.map((g) => (
            <button key={g.key} type="button" aria-pressed={pick.has(g.key)} onClick={() => setPick((p) => { const n = new Set(p); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
              className={cn("h-8 rounded-full border-1.5 px-3 text-[12.5px] font-bold", pick.has(g.key) ? "border-frost-hot bg-frost text-frost-ink" : "border-line hover:border-frost-hot")}>{g.label}</button>
          ))}
        </div>
      )}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[{ k: "days", v: Math.floor(totalMin / 1440) }, { k: "hours", v: Math.floor((totalMin % 1440) / 60) }, { k: "minutes", v: Math.round(totalMin % 60) }].map((x) => (
          <div key={x.k} className="rounded-2xl border-1.5 border-line bg-paper py-2.5"><div className="font-mono text-[28px] leading-none text-frost-text">{x.v}</div><div className="mt-1 text-[10.5px] font-bold uppercase tracking-[.1em] text-plum-muted">{x.k}</div></div>
        ))}
      </div>
      <p className="mt-2 text-[12px] font-semibold text-plum-muted">
        {solo ? "to finish this one" : `across ${rows.length} title${rows.length === 1 ? "" : "s"}`} · {fmt(totalMin)}{unknown ? ` · ${unknown} with no episode count yet aren't included` : ""}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] font-bold">
        Watch
        <input type="number" min={mode === "hours" ? 0.5 : 1} step={mode === "hours" ? 0.5 : 1} value={per} onChange={(e) => setPer(Math.max(0.5, Number(e.target.value) || 1))}
          className="h-9 w-[72px] rounded-full border-1.5 border-line bg-paper px-3 text-center font-mono outline-none focus:border-frost-hot" aria-label="Amount per day" />
        <select value={mode} onChange={(e) => setMode(e.target.value as "eps" | "hours")} className="h-9 rounded-full border-1.5 border-line bg-paper px-3 outline-none">
          <option value="eps">episodes</option><option value="hours">hours</option>
        </select>
        a day
      </div>
      <p className="mt-2 text-[13.5px] font-semibold">
        {totalMin <= 0 ? "Nothing left to watch here." : <>You&apos;d finish on <b className="text-frost-text">{dayLabel(done)}</b> · {days} day{days === 1 ? "" : "s"}</>}
      </p>
    </section>
  );
}
