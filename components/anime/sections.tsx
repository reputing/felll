import Link from "next/link";
import { Play } from "lucide-react";
import { all } from "@/lib/db";
import { getCharacters, getEpisodeList, getRecommendations, getStatistics, nextAiring, episodeAt, type AnimeFull } from "@/lib/jikan";
import { Countdown, LocalTime } from "@/components/countdown";
import { Poster } from "@/components/poster";
import { Shelf } from "@/components/shelf";
import { cn, compact } from "@/lib/utils";

export const card = "rounded-box border-1.5 border-line bg-cream-card p-5 sm:p-6";

/** Episode list with air dates, filler/recap flags, what's in the vault, and the drop dates still to come. */
export async function Episodes({ a, progress }: { a: AnimeFull; progress: number }) {
  const [list, vault] = await Promise.all([
    getEpisodeList(a.id),
    all<{ number: number; audio: string }>(
      `select e.number, group_concat(distinct s.audio) as audio from episodes e
       join video_sources s on s.episode_id = e.id and s.status = 'ready' where e.mal_id = ? group by e.number`,
      a.id,
    ),
  ]);
  const have = new Map(vault.map((v) => [v.number, v.audio]));
  const known = list.items;
  // upcoming drops, from the weekly broadcast slot. Jikan's own air dates win
  // over the estimate: the next drop is the one after the last aired episode.
  const upcoming: { n: number; at: number }[] = [];
  let at = nextAiring(a);
  if (at) {
    const lastAired = known.filter((k) => k.aired && Date.parse(k.aired) < Date.now()).reduce((m, k) => Math.max(m, k.number), 0);
    let n = Math.max(episodeAt(a, at) ?? 1, lastAired + 1);
    while (upcoming.length < 6 && (!a.episodes || n <= a.episodes)) {
      upcoming.push({ n, at });
      n++;
      at += 7 * 86400;
    }
  }
  const total = Math.max(a.episodes ?? 0, known.length, ...[...have.keys()]);
  const numbers = known.length ? known.map((k) => k.number) : Array.from({ length: total }, (_, i) => i + 1);
  if (!numbers.length && !upcoming.length) return null;
  const film = a.group === "film";

  return (
    <section id="episodes" className={cn(card, "scroll-mt-28")}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="eyebrow">{film ? "The film" : `${total || "?"} episodes · ${have.size} in the vault`}</div>
          <h2 className="mt-1 text-xl font-extrabold tracking-[-.6px]">Episodes &amp; drop dates</h2>
        </div>
        {list.hasNext && <span className="text-[12px] font-semibold text-plum-muted">showing the first {known.length}</span>}
      </div>

      {upcoming.length > 0 && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((u, i) => (
            <div key={u.n} className={cn("flex items-center justify-between gap-3 rounded-2xl border-1.5 px-4 py-3", i === 0 ? "border-frost-hot bg-cream-blush" : "border-line-soft bg-paper")}>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[.1em] text-plum-muted">{i === 0 ? "Next drop" : "Then"} · EP {u.n}</div>
                <LocalTime at={u.at} opts={{ weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} className="text-[13px] font-extrabold" />
              </div>
              <Countdown at={u.at} compact={i > 0} className={cn("text-[13px]", i === 0 ? "font-medium text-frost-text" : "text-plum-muted")} />
            </div>
          ))}
        </div>
      )}

      <ol className="scrollbar-none grid max-h-[560px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
        {numbers.map((n) => {
          const info = known.find((k) => k.number === n);
          const audio = have.get(n);
          const watched = n <= progress;
          return (
            <li key={n}>
              <Link href={`/watch/${a.id}/${n}`} className={cn("group grid grid-cols-[44px_1fr_auto] items-center gap-3 rounded-2xl border-1.5 border-line-soft bg-paper p-2 pr-3 transition hover:border-frost-hot", watched && "opacity-70")}>
                <span className={cn("grid h-11 place-items-center rounded-xl font-mono text-[14px]", audio ? "bg-frost text-frost-ink" : "bg-cream-tint text-plum-muted")}>
                  {audio ? <Play className="size-4" fill="currentColor" /> : String(n).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-extrabold">{film ? a.title : info?.title ?? `Episode ${n}`}</span>
                  <span className="flex flex-wrap gap-x-2 text-[11.5px] font-semibold text-plum-muted">
                    <span>EP {n}</span>
                    {info?.aired && <span>{new Date(info.aired).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</span>}
                    {info?.filler && <span className="text-sprinkle-butter">filler</span>}
                    {info?.recap && <span className="text-sprinkle-sky">recap</span>}
                    {watched && <span className="text-sprinkle-mint">watched</span>}
                  </span>
                </span>
                <span className="text-[10.5px] font-extrabold uppercase tracking-[.08em] text-plum-faint">{audio ? audio.replace(",", " · ") : info?.score ? `★ ${info.score.toFixed(1)}` : ""}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export async function Characters({ id }: { id: number }) {
  const chars = await getCharacters(id);
  if (!chars.length) return null;
  return (
    <section className={card}>
      <div className="eyebrow">Cast</div>
      <h2 className="mb-4 mt-1 text-xl font-extrabold tracking-[-.6px]">Characters &amp; voices</h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {chars.map((c) => (
          <div key={c.id} className="grid grid-cols-[48px_1fr_auto_48px] items-center gap-2.5 rounded-2xl border-1.5 border-line-soft bg-paper p-1.5">
            <Poster src={c.image} className="h-16 w-12 rounded-xl" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-extrabold">{c.name}</span>
              <span className="text-[11.5px] font-semibold text-plum-muted">{c.role}</span>
            </span>
            <span className="min-w-0 max-w-[110px] text-right">
              <span className="block truncate text-[12px] font-bold">{c.va?.name ?? ""}</span>
              <span className="text-[11px] font-semibold text-plum-faint">{c.va ? "Japanese" : ""}</span>
            </span>
            <Poster src={c.va?.image} className="h-16 w-12 rounded-xl" />
          </div>
        ))}
      </div>
    </section>
  );
}

export async function Recommendations({ id }: { id: number }) {
  const recs = await getRecommendations(id);
  return <Shelf eyebrow="If you like this" title="More like it" items={recs.map((r) => ({ id: r.id, title: r.title, image: r.image, note: `${r.votes} votes` }))} />;
}

/** Score spread: cupcake members next to MyAnimeList. */
export async function ScoreSpread({ id }: { id: number }) {
  const [mal, here] = await Promise.all([
    getStatistics(id),
    all<{ score: number; n: number }>("select score, count(*) as n from library where mal_id = ? and score is not null group by score", id),
  ]);
  const malTotal = mal?.scores.reduce((s, x) => s + x.votes, 0) ?? 0;
  const hereTotal = here.reduce((s, x) => s + x.n, 0);
  if (!malTotal && !hereTotal) return null;
  return (
    <section className={card}>
      <div className="eyebrow">How people rate it</div>
      <h2 className="mb-4 mt-1 text-xl font-extrabold tracking-[-.6px]">Score spread</h2>
      <div className="mb-3 flex gap-4 text-[12px] font-bold">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-frost-hot" />cupcake ({hereTotal})</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-line-hot" />MyAnimeList ({compact(malTotal)})</span>
      </div>
      <div className="flex h-40 items-end gap-1.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => {
          const h = hereTotal ? (here.find((x) => x.score === s)?.n ?? 0) / hereTotal : 0;
          const m = malTotal ? (mal?.scores.find((x) => x.score === s)?.votes ?? 0) / malTotal : 0;
          return (
            <div key={s} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <span className="w-1/2 rounded-t-md bg-frost-hot transition-all" style={{ height: `${Math.max(h * 100, h ? 4 : 0)}%` }} title={`${Math.round(h * 100)}% on cupcake`} />
                <span className="w-1/2 rounded-t-md bg-line-hot" style={{ height: `${Math.max(m * 100, m ? 4 : 0)}%` }} title={`${Math.round(m * 100)}% on MAL`} />
              </div>
              <span className="font-mono text-[11px] text-plum-muted">{s}</span>
            </div>
          );
        })}
      </div>
      {mal && (
        <dl className="mt-4 grid grid-cols-2 gap-2 border-t-1.5 border-line-soft pt-4 sm:grid-cols-4">
          {[["Watching", mal.watching], ["Completed", mal.completed], ["Plan to watch", mal.planning], ["Dropped", mal.dropped]].map(([k, v]) => (
            <div key={k as string}><dt className="text-[10px] font-bold uppercase tracking-[.12em] text-plum-muted">{k}</dt><dd className="font-mono text-[15px]">{compact(v as number)}</dd></div>
          ))}
        </dl>
      )}
    </section>
  );
}

export function SectionSkeleton({ h = 220 }: { h?: number }) {
  return <div className="rounded-box skeleton" style={{ height: h }} />;
}
