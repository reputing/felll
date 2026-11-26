import Link from "next/link";
import { Play } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { all } from "@/lib/db";
import { clock } from "@/lib/utils";
import { PageHead } from "@/components/page-head";
import { Poster } from "@/components/poster";
import { ClearMovieHistory } from "@/components/movies/clear-history";

export const metadata = { title: "History · Movies & Series" };

type Row = { imdb_id: string; media: string; season: number; episode: number; position: number; duration: number; watched: number; title: string; poster: string | null; ep_title: string | null; updated_at: number };

// Everything watched, newest first, grouped by day: the film and series counterpart of the anime history.
export default async function MovieHistory() {
  const me = await requireMember("/movies/history");
  const rows = await all<Row>("select imdb_id, media, season, episode, position, duration, watched, title, poster, ep_title, updated_at from movie_progress where user_id = ? order by updated_at desc limit 200", me.id).catch(() => []);
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = new Date(r.updated_at * 1000).toDateString();
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="Your films & series, newest first" title="History">{rows.length > 0 && <ClearMovieHistory />}</PageHead>
      {rows.length === 0 && <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">Nothing watched yet. Press play on something!</p>}
      {[...groups].map(([day, items]) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="eyebrow px-1">{day}</h2>
          {items.map((r) => {
            const tv = r.media === "tv";
            const pct = r.watched ? 100 : r.duration ? Math.min(100, (r.position / r.duration) * 100) : 0;
            return (
              <Link key={`${r.imdb_id}-${r.season}-${r.episode}`} href={`/movies/${r.media}-${r.imdb_id}${tv ? `?se=${r.season}&ep=${r.episode}` : ""}`} className="group grid grid-cols-[52px_1fr_auto] items-center gap-3 rounded-3xl border-1.5 border-line bg-cream-card p-2 pr-4 transition hover:border-frost-hot">
                <Poster src={r.poster ?? `https://images.metahub.space/poster/small/${r.imdb_id}/img`} className="h-[70px] w-[52px] rounded-xl" />
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-extrabold">{r.title}</span>
                  <span className="block truncate text-[12px] font-semibold text-plum-muted">
                    {tv ? `S${r.season} E${r.episode}${r.ep_title ? ` · ${r.ep_title}` : ""} · ` : ""}{r.watched ? "finished" : r.duration ? `${clock(r.position)} of ${clock(r.duration)}` : "started"}
                  </span>
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
