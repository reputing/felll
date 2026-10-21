import Link from "next/link";
import { Play } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { all } from "@/lib/db";
import { clock } from "@/lib/utils";
import { PageHead } from "@/components/page-head";
import { Poster } from "@/components/poster";
import { ClearHistory } from "@/components/box/clear-history";

export const metadata = { title: "History" };

type Row = { mal_id: number; episode: number; position: number; duration: number; title: string; image: string | null; updated_at: number };

export default async function History() {
  const me = await requireMember("/box/history");
  const rows = await all<Row>("select mal_id, episode, position, duration, title, image, updated_at from watch_progress where user_id = ? order by updated_at desc limit 200", me.id);
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const d = new Date(r.updated_at * 1000);
    const key = d.toDateString();
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="Your watching, newest first" title="History">{rows.length > 0 && <ClearHistory />}</PageHead>
      {rows.length === 0 && <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">Nothing watched yet. Press play on something!</p>}
      {[...groups].map(([day, items]) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="eyebrow px-1">{day}</h2>
          {items.map((r) => {
            const pct = r.duration ? Math.min(100, (r.position / r.duration) * 100) : 0;
            return (
              <Link key={`${r.mal_id}-${r.episode}`} href={`/watch/${r.mal_id}/${r.episode}`} className="group grid grid-cols-[52px_1fr_auto] items-center gap-3 rounded-3xl border-1.5 border-line bg-cream-card p-2 pr-4 transition hover:border-frost-hot">
                <Poster src={r.image} className="h-[70px] w-[52px] rounded-xl" />
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-extrabold">{r.title}</span>
                  <span className="text-[12px] font-semibold text-plum-muted">Episode {r.episode} · {pct >= 85 ? "finished" : `${clock(r.position)} of ${clock(r.duration)}`}</span>
                  <span className="mt-1.5 block h-1 w-full max-w-[260px] overflow-hidden rounded-full bg-cream-tint"><span className="block h-full rounded-full bg-frost-hot" style={{ width: `${pct}%` }} /></span>
                </span>
                <span className="grid size-10 place-items-center rounded-full bg-cream-tint text-frost-text transition group-hover:bg-frost group-hover:text-frost-ink"><Play className="size-4" fill="currentColor" /></span>
              </Link>
            );
          })}
        </section>
      ))}
    </div>
  );
}
