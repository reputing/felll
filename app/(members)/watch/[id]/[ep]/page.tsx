import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Clapperboard, Play } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAnime, getEpisodeList, nextAiring, episodeAt } from "@/lib/jikan";
import { anivexaEnabled, fetchAnivexaCatalog, malToAnilist } from "@/lib/anivexa";
import { refOf } from "@/lib/anime-ref";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/countdown";
import { Poster } from "@/components/poster";
import { ShareButton } from "@/components/share";
import { TrailerButton } from "@/components/trailer";
import { Comments } from "@/components/comments/comments";
import { LibraryControls } from "@/components/anime/library-controls";
import { Player, type Source, type Track } from "@/components/watch/player";
import { Reactions, RequestButton, WatchBeacon } from "@/components/watch/bits";

type Props = { params: Promise<{ id: string; ep: string }>; searchParams: Promise<{ t?: string }> };

export async function generateMetadata({ params }: Props) {
  const { id, ep } = await params;
  const a = await getAnime(Number(id)).catch(() => null);
  return { title: a ? `${a.title} · EP ${ep}` : "Watch" };
}

type EpRow = { id: number; number: number; title: string | null; intro_start: number | null; intro_end: number | null; outro_start: number | null };

export default async function WatchPage({ params, searchParams }: Props) {
  const p = await params;
  const id = Number(p.id), ep = Number(p.ep);
  if (!Number.isInteger(id) || !Number.isInteger(ep) || ep < 1) notFound();
  const me = await requireMember(`/watch/${id}/${ep}`);
  const d = await db();
  const [a, list, [vault, resume, watchers, req]] = await Promise.all([
    getAnime(id),
    getEpisodeList(id),
    d.batch<Record<string, unknown>>([
      d.prepare(
        `select e.id, e.number, e.title, e.intro_start, e.intro_end, e.outro_start, group_concat(distinct s.audio) as audio
         from episodes e join video_sources s on s.episode_id = e.id and s.status = 'ready' where e.mal_id = ? group by e.id order by e.number`,
      ).bind(id),
      d.prepare("select position, duration from watch_progress where user_id = ? and mal_id = ? and episode = ?").bind(me.id, id, ep),
      d.prepare(
        `select u.handle, u.avatar_url, u.accent from presence p join users u on u.id = p.user_id
         where p.mal_id = ? and p.episode = ? and p.updated_at > unixepoch() - 90 and p.user_id != ? limit 12`,
      ).bind(id, ep, me.id),
      d.prepare("select r.votes, exists(select 1 from request_votes v where v.mal_id = r.mal_id and v.user_id = ?) as voted from requests r where r.mal_id = ?").bind(me.id, id),
    ]),
  ]);
  if (!a) notFound();
  const total = a.episodes ?? Math.max(list.items.length, ep);
  if (a.episodes && ep > a.episodes) notFound();

  const inVault = vault.results as (EpRow & { audio: string })[];
  const here = inVault.find((e) => e.number === ep);
  const [sources, subtitles]: [Source[], Track[]] = here
    ? await d.batch<Source & Track>([
        d.prepare("select id, label, audio from video_sources where episode_id = ? and status = 'ready' order by priority, id").bind(here.id),
        d.prepare("select id, language, label, url, is_default from subtitles where episode_id = ?").bind(here.id),
      ]).then(([s, t]): [Source[], Track[]] => [s.results as Source[], t.results as Track[]])
    : [[], []];

  // External servers via the Anivexa bot (resolved by AniList id; this catalog
  // is MAL-keyed, so map MAL -> AniList first). Subtitles for these arrive with
  // the stream at play time.
  const anivexaSources: Source[] = [];
  let anivexaEps = new Set<number>();
  if (await anivexaEnabled()) {
    const anilistId = await malToAnilist(id);
    if (anilistId) {
      const catalog = await fetchAnivexaCatalog(anilistId);
      if (catalog) {
        anivexaEps = new Set(catalog.episodeNumbers);
        for (const prov of catalog.providers) {
          if (prov.sub.includes(ep)) anivexaSources.push({ id: `anivexa:${prov.slug}:${anilistId}:sub:${ep}`, label: prov.name, audio: "sub" });
          if (prov.dub.includes(ep)) anivexaSources.push({ id: `anivexa:${prov.slug}:${anilistId}:dub:${ep}`, label: prov.name, audio: "dub" });
        }
      }
    }
  }
  const allSources: Source[] = [...sources, ...anivexaSources];

  const sp = await searchParams;
  // resume where you left off, unless you'd basically finished: then from the top
  const saved = resume.results[0] as { position: number; duration: number } | undefined;
  const startAt = Number(sp.t) || (saved && !(saved.duration && saved.position / saved.duration > 0.9) ? saved.position : 0);
  const info = list.items.find((e) => e.number === ep);
  const epTitle = here?.title || info?.title || (a.group === "film" ? a.title : `Episode ${ep}`);
  const nextHref = ep < total ? `/watch/${id}/${ep + 1}` : null;
  const prevHref = ep > 1 ? `/watch/${id}/${ep - 1}` : null;
  const others = watchers.results as { handle: string; avatar_url: string | null; accent: string }[];
  const request = req.results[0] as { votes: number; voted: number } | undefined;
  const vaultSet = new Map(inVault.map((e) => [e.number, e.audio]));
  const numbers = Array.from({ length: Math.max(total, ...inVault.map((e) => e.number)) }, (_, i) => i + 1);
  const next = nextAiring(a);
  const nextEp = next ? episodeAt(a, next) : null;
  // trust Jikan's own air dates over the weekly-slot estimate
  const airedAlready = !!info?.aired && Date.parse(info.aired) < Date.now();
  const notYet = !here && !airedAlready && nextEp != null && ep >= nextEp;

  return (
    <div className="mx-auto flex max-w-[1560px] flex-col gap-5 px-3 pb-12 pt-4 sm:px-5">
      <WatchBeacon malId={id} episode={ep} title={a.title} />
      <nav aria-label="breadcrumb" className="flex items-center gap-1.5 px-1 text-[12.5px] font-bold text-plum-muted">
        <Link href={`/anime/${id}`} className="truncate hover:text-frost-text">{a.title}</Link>
        <ChevronRight className="size-3.5 flex-none" />
        <span className="flex-none text-frost-text">Episode {ep}</span>
      </nav>

      <div className="watch-grid grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {allSources.length ? (
            <Player
              key={here?.id ?? `ext-${ep}`}
              sources={allSources}
              subtitles={subtitles}
              intro={{ start: here?.intro_start ?? null, end: here?.intro_end ?? null }}
              outroStart={here?.outro_start ?? null}
              nextHref={nextHref && (vaultSet.has(ep + 1) || anivexaEps.has(ep + 1)) ? nextHref : null}
              prevHref={prevHref}
              startAt={startAt}
              poster={a.banner}
              meta={{ malId: id, ep, title: a.title, image: a.posterSm, episodes: a.episodes, format: a.format }}
            />
          ) : (
            <div className="relative grid aspect-video place-items-center overflow-hidden rounded-[26px] border-1.5 border-night-line bg-night p-6 text-center text-night-text">
              <div aria-hidden className="absolute inset-0 opacity-30"><Poster src={a.poster} className="size-full blur-2xl saturate-150" /></div>
              <div className="relative flex max-w-[460px] flex-col items-center gap-4">
                <span className="grid size-16 place-items-center rounded-3xl bg-night-line"><Clapperboard className="size-7 text-frost" /></span>
                {notYet && next ? (
                  <>
                    <h1 className="text-[24px] font-extrabold tracking-tight">Episode {ep} hasn’t aired yet</h1>
                    <Countdown at={next + (ep - nextEp!) * 7 * 86400} className="text-[30px] text-frost" />
                    <p className="text-[13.5px] text-night-muted">It drops {a.broadcast.day} at {a.broadcast.time} JST. Check back then.</p>
                  </>
                ) : (
                  <>
                    <h1 className="text-[24px] font-extrabold tracking-tight">Not in the vault yet</h1>
                    <p className="text-[14px] leading-relaxed text-night-muted">Nobody’s uploaded episode {ep} of {a.title} to cupcake yet. Request it, and you’ll get a ping when it lands.</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <RequestButton malId={id} title={a.title} image={a.posterSm} votes={request?.votes ?? 0} voted={!!request?.voted} />
                      {a.trailer && <TrailerButton id={a.trailer} title={a.title}><Button size="lg" variant="night"><Play className="size-4" />Trailer</Button></TrailerButton>}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-start justify-between gap-4 rounded-box border-1.5 border-line bg-cream-card p-5">
            <div className="min-w-0">
              <div className="eyebrow">Episode {ep}{info?.aired ? ` · aired ${new Date(info.aired).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}` : ""}{info?.filler ? " · filler" : ""}</div>
              <h2 className="mt-1 text-balance text-[22px] font-extrabold leading-tight tracking-[-.6px]">{epTitle}</h2>
              <Link href={`/anime/${id}`} className="text-[13.5px] font-bold text-frost-text hover:text-frost-deep">{a.title}</Link>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {prevHref && <Button variant="outline" asChild><Link href={prevHref}><ChevronLeft className="size-4" />Prev</Link></Button>}
              {nextHref && <Button asChild><Link href={nextHref}>Next<ChevronRight className="size-4" /></Link></Button>}
              <ShareButton path={`/watch/${id}/${ep}`} title={`${a.title} · EP ${ep}`} variant="outline" />
            </div>
            <div className="flex w-full flex-wrap items-center justify-between gap-3 border-t-1.5 border-line-soft pt-4">
              <Reactions malId={id} ep={ep} />
              <LibraryControls anime={refOf(a)} compact />
            </div>
            {others.length > 0 && (
              <div className="flex w-full items-center gap-2.5 rounded-2xl bg-cream-tint px-3.5 py-2.5 text-[13px] font-bold">
                <span className="flex -space-x-2">{others.slice(0, 6).map((o) => <Link key={o.handle} href={`/u/${o.handle}`}><Avatar src={o.avatar_url} name={o.handle} size={28} className="ring-2 ring-cream-tint" /></Link>)}</span>
                <span><span className="text-frost-text">{others.length}</span> {others.length === 1 ? "member is" : "members are"} on this episode with you</span>
                <span className="ml-auto size-2 rounded-full bg-sprinkle-mint animate-pulse-dot" />
              </div>
            )}
          </div>

          <Comments malId={id} episode={ep} title={a.title} image={a.posterSm} heading={`Episode ${ep} talk`} />
        </div>

        <aside className="watch-side flex max-h-[calc(100svh-120px)] flex-col overflow-hidden rounded-box border-1.5 border-line bg-cream-card lg:sticky lg:top-[100px]">
          <div className="flex items-center justify-between border-b-1.5 border-line-soft px-4 py-3.5">
            <h2 className="font-extrabold">Episodes</h2>
            <span className="rounded-full bg-cream-tint px-2.5 py-0.5 font-mono text-[12px] text-plum-muted">{vaultSet.size}/{total}</span>
          </div>
          <ol className="flex-1 overflow-y-auto p-2">
            {numbers.map((n) => {
              const meta = list.items.find((e) => e.number === n);
              const audio = vaultSet.get(n);
              const streamable = !!audio || anivexaEps.has(n);
              const on = n === ep;
              return (
                <li key={n}>
                  <Link href={`/watch/${id}/${n}`} aria-current={on ? "page" : undefined} scroll={false}
                    className={cn("grid grid-cols-[40px_1fr] items-center gap-2.5 rounded-2xl p-1.5 text-[13px] transition hover:bg-cream-tint", on && "bg-cream-blush text-frost-deep")}>
                    <span className={cn("grid h-10 place-items-center rounded-xl font-mono text-[13px]", on ? "bg-frost text-frost-ink" : streamable ? "bg-paper text-frost-text" : "bg-cream-tint text-plum-faint")}>
                      {on ? <Play className="size-4" fill="currentColor" /> : String(n).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{meta?.title ?? `Episode ${n}`}</span>
                      <span className="text-[11px] font-semibold text-plum-muted">{audio ? audio.replace(",", " · ").toUpperCase() : anivexaEps.has(n) ? "stream" : "not uploaded"}{meta?.filler ? " · filler" : ""}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
