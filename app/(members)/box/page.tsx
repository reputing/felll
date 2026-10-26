import Link from "next/link";
import { Clock3, Flame } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { all } from "@/lib/db";
import { memberStats } from "@/lib/stats";
import { BoxGrid, type BoxRow } from "@/components/box/box-grid";
import { PageHead } from "@/components/page-head";
import { Button } from "@/components/ui/button";

export const metadata = { title: "My box" };

export default async function Box() {
  const me = await requireMember("/box");
  const [rows, stats] = await Promise.all([
    all<BoxRow>("select mal_id, title, image, episodes, kind, updated_at, status, score, favorite, progress from library where user_id = ? order by updated_at desc", me.id),
    memberStats(me.id),
  ]);
  const tiles = [
    { k: "In your box", v: stats.entries },
    { k: "Completed", v: stats.completed },
    { k: "Episodes", v: stats.episodes },
    { k: "Hours (approx)", v: stats.hours },
    { k: "Mean score", v: stats.mean ?? "–" },
    { k: "Day streak", v: stats.streak },
    { k: "Manga read", v: stats.mangaRead },
  ];
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow={`@${me.handle} / the collection`} title="My watch box" sub="Everything you’re watching, planning, finished and loved.">
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link href="/box/history"><Clock3 className="size-4" />History</Link></Button>
          <Button asChild><Link href={`/u/${me.handle}`}>Your page</Link></Button>
        </div>
      </PageHead>
      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-3xl border-1.5 border-line bg-cream-card px-4 py-3.5">
            <dt className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[.12em] text-plum-muted">{t.k === "Day streak" && <Flame className="size-3 text-sprinkle-peach" />}{t.k}</dt>
            <dd className="mt-1 font-mono text-[26px] leading-none text-frost-text">{t.v}</dd>
          </div>
        ))}
      </dl>
      <BoxGrid rows={rows} initialTab={rows.some((r) => r.status === "watching") ? "watching" : "all"} />
    </div>
  );
}
