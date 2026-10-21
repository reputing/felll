import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Dice5, Eye, Music2, Play, Radio, Star, Users } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatLabel, getAnime, nextAiring, episodeAt, episodesLabel } from "@/lib/jikan";
import { refOf } from "@/lib/anime-ref";
import { compact } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/banner";
import { Poster } from "@/components/poster";
import { Countdown } from "@/components/countdown";
import { TrailerButton } from "@/components/trailer";
import { LibraryControls } from "@/components/anime/library-controls";
import { RatingPicker } from "@/components/anime/rating";
import { Comments } from "@/components/comments/comments";
import { ShareButton } from "@/components/share";
import { Characters, Episodes, Recommendations, ScoreSpread, SectionSkeleton, card } from "@/components/anime/sections";
import { ShelfSkeleton } from "@/components/shelf";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ surprise?: string }> };

export async function generateMetadata({ params }: Props) {
  const a = await getAnime(Number((await params).id)).catch(() => null);
  return { title: a?.title ?? "Anime" };
}

export default async function AnimePage({ params, searchParams }: Props) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const me = await requireMember(`/anime/${id}`);
  const d = await db();
  const [a, [community, watchingNow, resume, mine]] = await Promise.all([
    getAnime(id),
    d.batch<Record<string, number | null>>([
      d.prepare("select round(avg(score), 2) as avg, count(score) as n, count(*) as saves from library where mal_id = ?").bind(id),
      d.prepare("select count(*) as n from presence where mal_id = ? and updated_at > unixepoch() - 90").bind(id),
      d.prepare("select episode, position, duration from watch_progress where user_id = ? and mal_id = ? order by updated_at desc limit 1").bind(me.id, id),
      d.prepare("select progress from library where user_id = ? and mal_id = ?").bind(me.id, id),
    ]),
  ]);
  if (!a) notFound();
  const { surprise } = await searchParams;

  const c = community.results[0] as { avg: number | null; n: number; saves: number };
  const live = Number((watchingNow.results[0] as { n: number }).n);
  const r = resume.results[0] as { episode: number; position: number; duration: number } | undefined;
  const progress = Number((mine.results[0] as { progress: number } | undefined)?.progress ?? 0);
  const continueEp = r ? (r.duration && r.position / r.duration > 0.9 ? r.episode + 1 : r.episode) : progress ? progress + 1 : 1;
  const next = nextAiring(a);
  const ref = refOf(a);
  const info: [string, React.ReactNode][] = [
    ["Format", formatLabel(a)],
    ["Episodes", episodesLabel(a)],
    ["Status", a.status],
    ["Aired", a.aired],
    ["Season", a.season ? `${a.season[0].toUpperCase()}${a.season.slice(1)} ${a.year ?? ""}` : a.year ?? "—"],
    ["Broadcast", a.broadcast.day ? `${a.broadcast.day} ${a.broadcast.time ?? ""} JST` : "—"],
    ["Studios", a.studios.join(", ") || "—"],
    ["Source", a.source || "—"],
    ["Duration", a.duration || "—"],
    ["Rating", a.rating || "—"],
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      {surprise && (
        <div className="flex items-center justify-between gap-3 rounded-full border-1.5 border-line bg-cream-card py-2 pl-5 pr-2 text-[13.5px] font-bold animate-rise">
          <span>🎲 Surprise! The dice picked this one.</span>
          <Button size="sm" variant="soft" className="rounded-full" asChild><a href="/api/random"><Dice5 className="size-4" />Roll again</a></Button>
        </div>
      )}

      <section className="relative overflow-hidden rounded-shell border-1.5 border-night-line bg-night text-night-text">
        <div aria-hidden className="absolute inset-0 opacity-70" style={{ background: a.color }}>
          <Banner src={a.banner} fallback={a.poster} eager />
        </div>
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,var(--night)_0%,color-mix(in_srgb,var(--night)_88%,transparent)_45%,color-mix(in_srgb,var(--night)_30%,transparent)_100%),linear-gradient(0deg,var(--night)_0%,transparent_60%)]" />
        <div className="relative grid gap-6 p-5 sm:p-8 md:grid-cols-[220px_1fr]">
          <Poster src={a.poster} color={a.color} eager className="mx-auto aspect-[2/3] w-[180px] rounded-[22px] border-1.5 border-night-edge shadow-[0_30px_50px_-20px_rgba(0,0,0,.8)] md:w-[220px]" />
          <div className="flex min-w-0 flex-col justify-end gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-frost">
              <span>{formatLabel(a)}{a.year ? ` · ${a.year}` : ""}</span>
              {a.airing && <span className="flex items-center gap-1 rounded-full bg-frost px-2 py-0.5 text-frost-ink"><Radio className="size-3" />Airing</span>}
              {live > 0 && <span className="flex items-center gap-1 rounded-full border border-night-edge px-2 py-0.5 text-night-text"><span className="size-1.5 rounded-full bg-sprinkle-mint animate-pulse-dot" />{live} watching now</span>}
            </div>
            <h1 className="text-balance text-[clamp(30px,4vw,52px)] font-extrabold leading-[1] tracking-[-1.8px]">{a.title}</h1>
            <p className="text-[13.5px] font-medium text-night-muted">{[a.romaji !== a.title ? a.romaji : null, a.native].filter(Boolean).join(" · ")}</p>
            <div className="flex flex-wrap gap-1.5">
              {[...a.genres, ...a.themes, a.demographic].filter(Boolean).slice(0, 7).map((g) => (
                <Link key={g} href={`/browse?genre=${encodeURIComponent(g!)}`}><Badge variant="night" className="hover:border-frost">{g}</Badge></Link>
              ))}
            </div>
            <dl className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { k: "MAL score", v: a.score, s: a.scoredBy ? `${compact(a.scoredBy)} votes` : "", Icon: Star },
                { k: "cupcake", v: c.avg ? c.avg.toFixed(1) : "–", s: `${c.n} rating${c.n === 1 ? "" : "s"}`, Icon: Star },
                { k: "Ranked", v: a.rank ? `#${a.rank}` : "–", s: a.popularity ? `#${a.popularity} popular` : "", Icon: Eye },
                { k: "Members", v: compact(a.members), s: `${c.saves} here`, Icon: Users },
              ].map(({ k, v, s, Icon }) => (
                <div key={k} className="rounded-2xl border border-night-line bg-night/60 px-3.5 py-2.5 backdrop-blur">
                  <dt className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[.12em] text-night-muted"><Icon className="size-3" />{k}</dt>
                  <dd className="font-mono text-[20px] leading-tight">{v}</dd>
                  <dd className="text-[11px] font-semibold text-night-muted/80">{s}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <Button size="lg" asChild className="pl-[18px] font-extrabold">
                <Link href={`/watch/${a.id}/${Math.min(continueEp, a.episodes ?? continueEp)}`}><Play className="size-4" fill="currentColor" />{continueEp > 1 ? `Continue · EP ${continueEp}` : a.group === "film" ? "Watch the film" : "Watch episode 1"}</Link>
              </Button>
              {a.trailer && (
                <TrailerButton id={a.trailer} title={a.title}>
                  <Button size="lg" variant="night"><Play className="size-4" />Trailer</Button>
                </TrailerButton>
              )}
              <ShareButton path={`/anime/${a.id}`} title={a.title} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <section className={card}>
            <div className="flex flex-col gap-4">
              <LibraryControls anime={ref} />
              <RatingPicker anime={ref} />
            </div>
          </section>
          <section className={card}>
            <div className="eyebrow">Synopsis</div>
            <p className="mt-2 whitespace-pre-line text-pretty text-[14.5px] leading-relaxed text-plum-body">{a.description || "No synopsis yet."}</p>
            {a.background && <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-plum-muted">{a.background}</p>}
          </section>
          <Suspense fallback={<SectionSkeleton h={320} />}><Episodes a={a} progress={progress} /></Suspense>
          <Suspense fallback={<SectionSkeleton h={260} />}><Characters id={a.id} /></Suspense>
          <Suspense fallback={<ShelfSkeleton />}><Recommendations id={a.id} /></Suspense>
          <Comments malId={a.id} title={a.title} image={a.posterSm} />
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[100px]">
          {next && (
            <section className="rounded-box border-1.5 border-frost-hot bg-cream-blush p-5">
              <div className="eyebrow text-frost-deep">Next episode{episodeAt(a, next) ? ` · EP ${episodeAt(a, next)}` : ""}</div>
              <Countdown at={next} className="mt-2 block text-[28px] font-medium tracking-tight text-frost-deep" />
              <p className="mt-1 text-[12px] font-semibold text-plum-muted">{a.broadcast.day} at {a.broadcast.time} JST</p>
            </section>
          )}
          <section className={card}>
            <div className="eyebrow mb-3">Details</div>
            <dl className="flex flex-col gap-2.5">
              {info.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[92px_1fr] gap-2 text-[13px]">
                  <dt className="font-bold text-plum-muted">{k}</dt><dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          {a.relations.length > 0 && (
            <section className={card}>
              <div className="eyebrow mb-3">Related</div>
              <ul className="flex flex-col gap-2">
                {a.relations.flatMap((rel) => rel.entries.filter((e) => e.type === "anime").map((e) => (
                  <li key={rel.relation + e.id}>
                    <Link href={`/anime/${e.id}`} className="block rounded-xl px-2 py-1.5 hover:bg-cream-tint">
                      <span className="block text-[10.5px] font-bold uppercase tracking-[.1em] text-plum-muted">{rel.relation}</span>
                      <span className="text-[13px] font-extrabold">{e.name}</span>
                    </Link>
                  </li>
                )))}
              </ul>
            </section>
          )}
          {(a.openings.length > 0 || a.endings.length > 0) && (
            <section className={card}>
              <div className="eyebrow mb-3 flex items-center gap-1.5"><Music2 className="size-3" />Theme songs</div>
              <ul className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-plum-body">
                {a.openings.slice(0, 3).map((s) => <li key={s}><span className="font-bold text-frost-text">OP</span> {s}</li>)}
                {a.endings.slice(0, 3).map((s) => <li key={s}><span className="font-bold text-sprinkle-lilac">ED</span> {s}</li>)}
              </ul>
            </section>
          )}
          <Suspense fallback={<SectionSkeleton h={240} />}><ScoreSpread id={a.id} /></Suspense>
          {a.streaming.length > 0 && (
            <section className={card}>
              <div className="eyebrow mb-3">Also streaming on</div>
              <div className="flex flex-wrap gap-1.5">{a.streaming.map((s) => <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer"><Badge variant="outline" className="hover:border-frost-hot">{s.name}</Badge></a>)}</div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
