"use client";
import Link from "next/link";
import { CalendarDays, Clapperboard, Dice5, LayoutGrid, Sparkles, Tv } from "lucide-react";
import type { Anime, Group } from "@/lib/jikan";
import { SaveIcon } from "@/components/icons";
import { actions, set, useBox } from "@/lib/store";
import { cn } from "@/lib/utils";

const DOTS = ["#e8679a", "#4fbf9c", "#9479e8", "#e0a93a", "#4aa6dd", "#ef8a5c"];
const LIB: { v: "all" | Group; label: string; Icon: typeof Tv }[] = [
  { v: "all", label: "All anime", Icon: LayoutGrid },
  { v: "tv", label: "TV series", Icon: Tv },
  { v: "film", label: "Films", Icon: Clapperboard },
  { v: "other", label: "OVAs & specials", Icon: Sparkles },
];
const row = "grid w-full items-center gap-3 rounded-[14px] px-3 text-left font-semibold transition-colors hover:bg-cream-tint";

export function LibrarySidebar({ pool, className }: { pool: Anime[]; className?: string }) {
  const fmt = useBox((s) => s.fmt), active = useBox((s) => s.genres), savedOnly = useBox((s) => s.savedOnly);
  const savedN = useBox((s) => pool.filter((m) => s.lib[m.id]?.status).length);

  const counts: Record<string, number> = {};
  pool.forEach((m) => m.genres.forEach((g) => (counts[g] = (counts[g] || 0) + 1)));
  const genres = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([g]) => g);
  active.forEach((g) => !genres.includes(g) && genres.push(g));

  return (
    <aside aria-label="library" className={cn("rounded-box border-1.5 border-line bg-cream-card p-[9px]", className)}>
      <div className="flex flex-col gap-1.5 rounded-[21px] border-1.5 border-dashed border-line px-3 pb-3.5 pt-[22px]">
        <div className="px-2.5">
          <div className="eyebrow">Your library</div>
          <div className="mt-1.5 text-[21px] font-extrabold tracking-[-.6px] text-frost-deep">Take a look.</div>
        </div>
        <hr className="mb-2 mt-3.5 border-t-1.5 border-line-soft" />
        {LIB.map(({ v, label, Icon }) => (
          <button key={v} type="button" aria-pressed={fmt === v} onClick={() => set({ fmt: v })}
            className={cn(row, "h-11 grid-cols-[22px_1fr_auto]", fmt === v && "bg-cream-blush text-frost-deep")}>
            <Icon className="size-[18px]" strokeWidth={2} /><span>{label}</span>
            <span className="font-mono text-xs text-plum-muted">{v === "all" ? pool.length : pool.filter((m) => m.group === v).length}</span>
          </button>
        ))}
        <div className="eyebrow px-3 pb-1.5 pt-[18px]">Browse by genre</div>
        {genres.map((g, i) => {
          const on = active.includes(g);
          return (
            <button key={g} type="button" aria-pressed={on} onClick={() => actions.toggleGenre(g)}
              className={cn(row, "h-[38px] grid-cols-[12px_1fr_auto] gap-2.5 rounded-xl text-[13.5px]", on && "bg-cream-blush text-frost-deep")}>
              <span aria-hidden className="h-1 w-[11px] rounded" style={{ background: DOTS[i % 6], transform: `rotate(${((i * 47) % 90) - 45}deg)` }} />
              <span>{g}</span><span className="font-mono text-xs text-plum-muted">{counts[g] ?? 0}</span>
            </button>
          );
        })}
        <hr className="mb-1.5 mt-3 border-t-1.5 border-line-soft" />
        <button type="button" aria-pressed={savedOnly} onClick={() => set({ savedOnly: !savedOnly })}
          className={cn(row, "h-11 grid-cols-[22px_1fr_auto]", savedOnly && "bg-cream-blush text-frost-deep")}>
          <SaveIcon on={savedOnly} className="size-[18px]" /><span>My watch box</span><span className="font-mono text-xs text-plum-muted">{savedN}</span>
        </button>
        <Link href="#oven" className={cn(row, "h-11 grid-cols-[22px_1fr]")}>
          <CalendarDays className="size-[18px]" strokeWidth={2} /><span>Weekly lineup</span>
        </Link>
        <a href="/api/random" className={cn(row, "h-11 grid-cols-[22px_1fr]")}>
          <Dice5 className="size-[18px]" strokeWidth={2} /><span>Surprise me</span>
        </a>
      </div>
    </aside>
  );
}
