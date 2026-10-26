import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { all } from "@/lib/db";
import { PageHead } from "@/components/page-head";
import { Poster } from "@/components/poster";
import { ClearMangaHistory } from "@/components/manga/clear-history";

export const metadata = { title: "Reading history" };

type Row = { manga_id: string; chapter_id: string; chapter_num: string; page: number; title: string; cover: string | null; updated_at: number };

export default async function MangaHistory() {
  const me = await requireMember("/manga/history");
  // 18+ titles save no progress, so they never appear here (reading stays private).
  const rows = await all<Row>(
    "select manga_id, chapter_id, chapter_num, page, title, cover, updated_at from manga_progress where user_id = ? order by updated_at desc limit 200",
    me.id,
  );
  const dayRows = await all<{ day: string }>(
    "select distinct date(updated_at, 'unixepoch') as day from manga_progress where user_id = ? order by day desc limit 120",
    me.id,
  ).catch(() => []);
  // consecutive reading days ending today or yesterday
  const days = new Set(dayRows.map((d) => d.day));
  let streak = 0;
  const d = new Date();
  if (!days.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) { streak++; d.setUTCDate(d.getUTCDate() - 1); }

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = new Date(r.updated_at * 1000).toDateString();
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow={streak > 1 ? `${streak}-day reading streak ♡` : "your reading, newest first"} title="Reading history">{rows.length > 0 && <ClearMangaHistory />}</PageHead>
      {rows.length === 0 && <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">Nothing read yet. Open a chapter! <Link href="/manga" className="text-frost-text">Find something →</Link></p>}
      {[...groups].map(([day, items]) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="eyebrow px-1">{day}</h2>
          {items.map((r) => (
            <Link key={r.manga_id} href={`/manga/${r.manga_id}/${r.chapter_id}`} className="group grid grid-cols-[52px_1fr_auto] items-center gap-3 rounded-3xl border-1.5 border-line bg-cream-card p-2 pr-4 transition hover:border-frost-hot">
              <Poster src={r.cover} className="h-[70px] w-[52px] rounded-xl" />
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-extrabold">{r.title}</span>
                <span className="text-[12px] font-semibold text-plum-muted">Ch. {r.chapter_num || "?"} · page {r.page + 1}</span>
              </span>
              <span className="grid size-10 place-items-center rounded-full bg-cream-tint text-frost-text transition group-hover:bg-frost group-hover:text-frost-ink"><BookOpen className="size-4" /></span>
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}
