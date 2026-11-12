import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, Clock, Play, Star } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { all, first } from "@/lib/db";
import { movieDetail, movieCatalog, movieStoryMap, moviesEnabled, type MovieMedia } from "@/lib/tmdb";
import { Poster } from "@/components/poster";
import { MoviePlayer } from "@/components/movies/player";
import { TitleActions } from "@/components/movies/title-actions";
import { Episodes } from "@/components/movies/episodes";
import { Cast } from "@/components/movies/cast";
import { Comments } from "@/components/comments/comments";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ se?: string; ep?: string }> };

// Route key is `${media}-${id}`: the IMDb id for titles from the keyless catalog (movie-tt0111161, tv-tt0903747), or a
// TMDB id (movie-157336) for links made while a TMDB key was in use.
function parseSlug(slug: string): { media: MovieMedia; id: number | string } | null {
  const m = /^(movie|tv)-(tt\d{5,10}|\d+)$/.exec(slug);
  return m ? { media: m[1] as MovieMedia, id: m[2].startsWith("tt") ? m[2] : Number(m[2]) } : null;
}

export async function generateMetadata({ params }: Props) {
  const ref = parseSlug((await params).slug);
  const d = ref ? await movieDetail(ref.media, ref.id).catch(() => null) : null;
  // no-referrer: the direct stream's CDN is happiest with no Referer at all (a video element cannot set its own policy;
  // the embed iframes set theirs).
  return { title: d ? d.title : "Watch", referrer: "no-referrer" as const };
}

export default async function MovieWatchPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const me = await requireMember(`/movies/${slug}`);
  if (!(await moviesEnabled())) redirect("/movies");

  const ref = parseSlug(slug);
  if (!ref) notFound();
  const d = await movieDetail(ref.media, ref.id);
  if (!d) notFound();
  const imdb = d.imdbId ?? "";
  // The list, ticks, history and comments need migration 0021 (movie_library, movie_progress, movie_comments). Until it has
  // been applied to this database the page shows the player and the details without them, instead of controls that fail.
  const ready = await first("select 1 as ok from movie_library limit 1").then(() => true).catch(() => false);

  const sp = await searchParams;
  const tv = d.isSeries;
  const seasons = d.seasons.map((s) => s.season);
  // the episode to play: the one asked for, else where this member left off, else the first
  const mine = imdb && ready ? await all<{ season: number; episode: number; position: number; duration: number; watched: number; updated_at: number }>("select season, episode, position, duration, watched, updated_at from movie_progress where user_id = ? and imdb_id = ?", me.id, imdb).catch(() => []) : [];
  const latest = [...mine].sort((a, b) => b.updated_at - a.updated_at)[0];
  let se: number | undefined, ep: number | undefined;
  if (tv) {
    if (sp.se && sp.ep) { se = Number(sp.se) || 1; ep = Number(sp.ep) || 1; }
    else if (latest) {
      // resume the episode being watched, or move on to the one after a finished one
      const eps = d.episodes ?? [];
      const i = eps.findIndex((e) => e.se === latest.season && e.ep === latest.episode);
      const next = latest.watched && i >= 0 ? eps[i + 1] : null;
      se = next?.se ?? latest.season; ep = next?.ep ?? latest.episode;
    } else { se = seasons[0] ?? 1; ep = 1; }
  }
  const row = mine.find((m) => m.season === (se ?? 0) && m.episode === (ep ?? 0));
  const resume = row && !row.watched && row.position > 30 ? Math.floor(row.position) : undefined;

  const allEps = d.episodes ?? [];
  const seasonEps = tv && se ? allEps.filter((e) => e.se === se) : [];
  const idx = tv ? allEps.findIndex((e) => e.se === se && e.ep === ep) : -1;
  const nextEp = idx >= 0 ? allEps.slice(idx + 1).find((e) => !e.aired || Date.parse(e.aired) <= Date.now()) : null;
  const curEp = idx >= 0 ? allEps[idx] : null;
  const totalAired = allEps.filter((e) => !e.aired || Date.parse(e.aired) <= Date.now()).length || null;

  // Zeus (our own player, no ads) is the only server. Third-party embed players are not offered at all: they open ad tabs
  // and redirects and cannot be sandboxed (see lib/movie-servers.ts, kept for reference and the health page).
  const embeds: { name: string; url: string }[] = [];
  const [story, avg, similar] = await Promise.all([
    movieStoryMap(d.media, d.id).catch(() => null),
    imdb ? first<{ a: number | null; n: number }>("select avg(score) as a, count(score) as n from movie_library where imdb_id = ?", imdb).catch(() => null) : Promise.resolve(null),
    movieCatalog({ type: d.media, genre: d.genres[0], sort: "popular" }).then((r) => r.items.filter((i) => i.slug !== slug).slice(0, 14)).catch(() => []),
  ]);

  const streamQs = new URLSearchParams({ media: d.media, title: d.title, ...(d.year ? { year: String(d.year) } : {}), ...(imdb ? { imdb } : {}), ...(se ? { se: String(se), ep: String(ep ?? 1) } : {}) });
  const streamSrc = `/api/movie/stream?${streamQs}`;
  const watchedEps = mine.filter((m) => m.watched && m.season === se).map((m) => m.episode);
  const base = { imdb, title: d.title, poster: d.poster, year: d.year, episodes: totalAired };

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <nav aria-label="breadcrumb" className="flex items-center gap-1.5 px-1 text-[12.5px] font-bold text-plum-muted">
        <Link href="/movies" className="hover:text-frost-text">Movies &amp; Series</Link>
        <ChevronRight className="size-3.5" /><span className="truncate text-frost-text">{d.title}</span>
      </nav>

      {streamSrc || embeds.length ? (
        <MoviePlayer
          key={`${slug}-${se ?? 0}-${ep ?? 0}`} streamSrc={streamSrc} embeds={embeds} poster={d.backdrop ?? d.poster} subKey={`m:${slug}${tv ? `-s${se}e${ep}` : ""}`}
          track={imdb && ready ? { imdb, media: d.media, season: se, episode: ep, title: d.title, poster: d.poster, year: d.year, epTitle: curEp?.title ?? null, episodes: totalAired, resume } : undefined}
        />
      ) : (
        <div className="grid aspect-video w-full place-items-center rounded-[26px] border-1.5 border-night-line bg-night p-6 text-center text-night-muted">
          <div>
            <p className="text-[17px] font-extrabold text-night-text">Not streamable right now</p>
            <p className="mt-1 text-[13.5px]">No sources for this title yet{tv ? " for this episode" : ""}. Try another{tv ? " episode or " : " "}server.</p>
          </div>
        </div>
      )}

      {tv && curEp && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <div className="eyebrow">Season {se} · Episode {ep}</div>
            <div className="truncate text-[15px] font-extrabold">{curEp.title}</div>
          </div>
          {nextEp && (
            <Link href={`/movies/${slug}?se=${nextEp.se}&ep=${nextEp.ep}`} scroll={false} className="flex h-10 items-center gap-2 rounded-full border-1.5 border-frost-hot bg-frost px-4 text-[13px] font-extrabold text-frost-ink">
              Next: {nextEp.se !== se ? `S${nextEp.se} ` : ""}E{nextEp.ep}<Play className="size-3.5" fill="currentColor" />
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-5 rounded-box border-1.5 border-line bg-cream-card p-5 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="eyebrow">{tv ? "Series" : "Movie"}{d.year ? ` · ${d.year}` : ""}</div>
          <h1 className="mt-1 text-balance text-[26px] font-extrabold leading-tight tracking-[-.8px]">{d.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-bold text-plum-body">
            {d.rating && <span className="flex items-center gap-1"><Star className="size-3.5 text-sprinkle-star" fill="currentColor" />{d.rating} <span className="font-semibold text-plum-muted">IMDb</span></span>}
            {d.runtime && <span className="flex items-center gap-1"><Clock className="size-3.5 text-plum-muted" />{d.runtime}</span>}
            {tv && d.seasons.length > 0 && <span>{d.seasons.length} season{d.seasons.length === 1 ? "" : "s"}</span>}
          </div>
          {d.genres.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5">{d.genres.slice(0, 6).map((g) => <Link key={g} href={`/movies?genre=${encodeURIComponent(g)}`} className="rounded-full border-1.5 border-line-soft bg-paper px-2.5 py-0.5 text-[11.5px] font-bold text-plum-muted hover:border-frost-hot">{g}</Link>)}</div>}
          {d.overview && <p className="mt-3 max-w-prose text-[14px] leading-relaxed text-plum-body">{d.overview}</p>}
          {d.trailer && <a href={`https://www.youtube.com/watch?v=${d.trailer}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-9 items-center gap-2 rounded-full border-1.5 border-line bg-paper px-3.5 text-[12.5px] font-extrabold hover:border-frost-hot"><Play className="size-3.5" fill="currentColor" />Trailer</a>}
          {imdb && ready && (
            <div className="mt-5">
              <TitleActions t={{ imdb, media: d.media, title: d.title, poster: d.poster, year: d.year, episodes: totalAired }} cupcake={{ avg: avg?.a ?? null, n: avg?.n ?? 0 }} />
            </div>
          )}
        </div>
        <Poster src={d.poster} className="hidden aspect-[2/3] w-[150px] flex-none rounded-2xl border-1.5 border-line sm:block" />
      </div>

      {tv && d.seasons.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-[11px] font-extrabold uppercase tracking-[.12em] text-plum-muted">Season</span>
          {d.seasons.map((s) => (
            <Link key={s.season} href={`/movies/${slug}?se=${s.season}&ep=1`} scroll={false}
              className={cn("h-8 min-w-8 rounded-full border-1.5 border-line bg-cream-card px-3 text-center text-[12.5px] font-extrabold leading-[29px] hover:border-frost-hot", s.season === se && "border-frost-hot bg-frost text-frost-ink")}>
              {s.season}
            </Link>
          ))}
        </div>
      )}

      {tv && se && seasonEps.length > 0 && <Episodes key={`s${se}`} ticks={ready} slug={slug} base={base} rows={seasonEps} watched={watchedEps} current={ep ?? 1} season={se} />}

      <Cast names={d.cast.map((c) => c.name)} directors={d.directors} />

      {story && (
        <section className="rounded-box border-1.5 border-line bg-cream-card p-5" aria-label="Story map">
          <div className="eyebrow">Story map</div>
          <h2 className="mt-1 text-lg font-extrabold tracking-[-.4px]">{story.kind === "collection" ? `${story.name} · ${story.items.length} films, in release order` : `${story.items.filter((i) => i.season).length} seasons${story.items.some((i) => i.season === 0) ? " and specials" : ""}`}</h2>
          <ol className="scrollbar-none mt-3 flex gap-3 overflow-x-auto pb-1 pt-2">
            {story.items.map((it, i) => {
              const here = story.kind === "collection" ? it.id === d.id : it.season === se;
              const href = story.kind === "collection" ? (it.slug ? `/movies/${it.slug}` : null) : it.season ? `/movies/${slug}?se=${it.season}&ep=1` : null;
              const tile = (
                <>
                  <span className="relative block">
                    <Poster src={it.poster ?? d.poster} className={cn("aspect-[2/3] rounded-2xl border-1.5 transition", here ? "border-frost-hot" : "border-line group-hover:border-frost-hot")} />
                    <span className="absolute left-1.5 top-1.5 grid h-6 min-w-6 place-items-center rounded-lg bg-black/75 px-1.5 font-mono text-[12px] font-extrabold text-white">{story.kind === "collection" ? i + 1 : it.season === 0 ? "SP" : it.season}</span>
                  </span>
                  <span className="mt-1.5 line-clamp-2 block text-[12.5px] font-extrabold leading-tight">{it.title}</span>
                  <span className="block text-[11.5px] font-semibold text-plum-muted">{[it.year, it.note].filter(Boolean).join(" · ")}{here ? " · you are here" : ""}</span>
                </>
              );
              return (
                <li key={`${it.id}-${i}`} className="w-[118px] flex-none">
                  {href ? <Link href={href} scroll={false} aria-current={here ? "page" : undefined} className="group block">{tile}</Link> : <div className="block opacity-70">{tile}</div>}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {similar.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="More like this">
          <h2 className="px-1 text-lg font-extrabold tracking-[-.4px]">More {d.genres[0] ? d.genres[0].toLowerCase() : "like this"}</h2>
          <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
            {similar.map((m) => (
              <Link key={m.slug} href={`/movies/${m.slug}`} className="group w-[128px] flex-none">
                <Poster src={m.poster} className="aspect-[2/3] rounded-2xl border-1.5 border-line transition group-hover:-translate-y-1 group-hover:border-frost-hot" />
                <div className="mt-1.5 line-clamp-2 px-0.5 text-[12.5px] font-extrabold leading-tight">{m.title}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {imdb && ready && (
        <Comments
          key={`c-${slug}-${se ?? 0}-${ep ?? 0}`} api="/api/movie/comments" scope={tv ? { imdb, season: se, ep } : { imdb }}
          title={d.title} image={d.poster} heading={tv ? `Season ${se} · Episode ${ep} talk` : `${d.title} talk`}
        />
      )}
    </div>
  );
}
