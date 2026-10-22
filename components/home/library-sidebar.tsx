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

export function LibrarySidebar({ pool, total, className }: { pool: Anime[]; total?: number; className?: string }) {
  const fmt = useBox((s) => s.fmt), active = useBox((s) => s.genres);
  const lib = useBox((s) => s.lib);

  // "Your library" is your watch box, not the whole catalog: everything here
  // counts only what you've saved, and it stays empty until you add something.
  const mine = pool.filter((m) => lib[m.id]?.status);
  const empty = mine.length === 0;
  const counts: Record<string, number> = {};
  mine.forEach((m) => m.genres.forEach((g) => (counts[g] = (counts[g] || 0) + 1)));
  const genres = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([g]) => g);
  active.forEach((g) => !genres.includes(g) && genres.push(g));

  // selecting a format/genre browses within your box
  const pickFmt = (v: "all" | Group) => set({ fmt: v, savedOnly: true });
  const pickGenre = (g: string) => { set({ savedOnly: true }); actions.toggleGenre(g); };

  return (
    <aside aria-label="library" className={cn("rounded-box border-1.5 border-line bg-cream-card/80 p-[9px] backdrop-blur-xl", className)}>
      <div className="flex flex-col gap-1.5 rounded-[21px] border-1.5 border-dashed border-line px-3 pb-3.5 pt-[22px]">
        <div className="px-2.5">
          <div className="eyebrow">Your library</div>
          <div className="mt-1.5 text-[21px] font-extrabold tracking-[-.6px] text-frost-deep">{empty ? "Nothing yet." : "Take a look."}</div>
        </div>
        <hr className="mb-2 mt-3.5 border-t-1.5 border-line-soft" />
        {empty ? (
          <div className="flex flex-col items-center gap-1.5 rounded-2xl border-1.5 border-dashed border-line bg-cream-tint/50 px-4 py-6 text-center">
            <SaveIcon on={false} className="size-6 text-frost-text" />
            <p className="text-[13.5px] font-extrabold">Your box is empty</p>
            <p className="text-[12px] font-semibold leading-snug text-plum-muted">Tap the bookmark on any anime and it’ll gather here.</p>
          </div>
        ) : (
          <>
            {LIB.map(({ v, label, Icon }) => {
              const n = v === "all" ? mine.length : mine.filter((m) => m.group === v).length;
              if (v !== "all" && n === 0) return null;
              return (
                <button key={v} type="button" aria-pressed={fmt === v} onClick={() => pickFmt(v)}
                  className={cn(row, "h-11 grid-cols-[22px_1fr_auto]", fmt === v && "bg-cream-blush text-frost-deep")}>
                  <Icon className="size-[18px]" strokeWidth={2} /><span>{label}</span>
                  <span className="font-mono text-xs text-plum-muted">{n}</span>
                </button>
              );
            })}
            {genres.length > 0 && <div className="eyebrow px-3 pb-1.5 pt-[18px]">Browse by genre</div>}
            {genres.map((g, i) => {
              const on = active.includes(g);
              return (
                <button key={g} type="button" aria-pressed={on} onClick={() => pickGenre(g)}
                  className={cn(row, "h-[38px] grid-cols-[12px_1fr_auto] gap-2.5 rounded-xl text-[13.5px]", on && "bg-cream-blush text-frost-deep")}>
                  <span aria-hidden className="h-1 w-[11px] rounded" style={{ background: DOTS[i % 6], transform: `rotate(${((i * 47) % 90) - 45}deg)` }} />
                  <span>{g}</span><span className="font-mono text-xs text-plum-muted">{counts[g] ?? 0}</span>
                </button>
              );
            })}
          </>
        )}
        <hr className="mb-1.5 mt-3 border-t-1.5 border-line-soft" />
        <Link href="#oven" className={cn(row, "h-11 grid-cols-[22px_1fr]")}>
          <CalendarDays className="size-[18px]" strokeWidth={2} /><span>Weekly lineup</span>
        </Link>
        <a href="/api/random" className={cn(row, "h-11 grid-cols-[22px_1fr]")}>
          <Dice5 className="size-[18px]" strokeWidth={2} /><span>Surprise me</span>
        </a>
        <Link href="/browse" className={cn(row, "h-11 grid-cols-[22px_1fr_auto] text-frost-text")}>
          <LayoutGrid className="size-[18px]" strokeWidth={2} /><span>Browse all anime</span>
          {total != null && <span className="font-mono text-xs text-plum-muted">{total.toLocaleString()}</span>}
        </Link>
      </div>
    </aside>
  );
}
