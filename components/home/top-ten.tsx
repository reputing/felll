"use client";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Poster } from "@/components/poster";
import { formatLabel, type Anime } from "@/lib/jikan";
import { set } from "@/lib/store";
import { cn, pad2 } from "@/lib/utils";

export interface Ranked { id: number; title: string; image: string | null; note: string }

const TABS = [{ v: "trending", label: "Airing" }, { v: "season", label: "Season" }, { v: "top", label: "All time" }, { v: "cupcake", label: "Here" }] as const;

export function TopTen({ lists, local }: { lists: Record<"trending" | "season" | "top", Anime[]>; local: Ranked[] }) {
  return (
    <section aria-labelledby="top" className="rounded-box border-1.5 border-line bg-cream-card px-3 pb-3 pt-[18px]">
      <Tabs defaultValue="trending">
        <div className="px-1.5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="top" className="text-[17px] font-extrabold tracking-[-.4px]">Top ten tray</h2>
            <Link href="/rankings" className="text-[12px] font-bold text-frost-text hover:text-frost-deep">All rankings</Link>
          </div>
          <TabsList aria-label="ranking">{TABS.map((t) => <TabsTrigger key={t.v} value={t.v}>{t.label}</TabsTrigger>)}</TabsList>
        </div>
        {(["trending", "season", "top"] as const).map((k) => (
          <TabsContent key={k} value={k}>
            <ol className="flex flex-col gap-0.5">
              {lists[k].slice(0, 10).map((a, i) => (
                <li key={a.id}>
                  <button type="button" onClick={() => set({ sel: a.id })} className="grid w-full grid-cols-[30px_36px_1fr] items-center gap-2.5 rounded-[14px] p-1.5 text-left hover:bg-cream-tint">
                    <span className={cn("text-center font-mono text-[15px] font-medium", i < 3 ? "text-frost-text" : "text-plum-faint")}>{pad2(i + 1)}</span>
                    <Poster src={a.posterSm} color={a.color} className="h-[50px] w-9 rounded-[9px]" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-extrabold leading-tight">{a.title}</span>
                      <span className="text-[11.5px] font-medium text-plum-muted">★ {a.score} · {formatLabel(a)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </TabsContent>
        ))}
        <TabsContent value="cupcake">
          {local.length === 0 && <p className="px-2 py-6 text-center text-[13px] text-plum-muted">Nobody’s pressed play this week. Be the first.</p>}
          <ol className="flex flex-col gap-0.5">
            {local.map((a, i) => (
              <li key={a.id}>
                <Link href={`/anime/${a.id}`} className="grid w-full grid-cols-[30px_36px_1fr] items-center gap-2.5 rounded-[14px] p-1.5 hover:bg-cream-tint">
                  <span className={cn("text-center font-mono text-[15px] font-medium", i < 3 ? "text-frost-text" : "text-plum-faint")}>{pad2(i + 1)}</span>
                  <Poster src={a.image} className="h-[50px] w-9 rounded-[9px]" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-extrabold leading-tight">{a.title}</span>
                    <span className="text-[11.5px] font-medium text-plum-muted">{a.note}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </TabsContent>
      </Tabs>
    </section>
  );
}
