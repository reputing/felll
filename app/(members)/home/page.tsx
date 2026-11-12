import { Suspense } from "react";
import { requireMember } from "@/lib/auth";
import { all } from "@/lib/db";
import { episodeAt, getCatalogTop, getForYou, getHome, nextAiring, type Anime } from "@/lib/jikan";
import { Hero } from "@/components/home/hero";
import { KeepWatching, animeKW, type Resume } from "@/components/home/keep-watching";
import { QueueRail } from "@/components/queue/queue-rail";
import { MangaKeepReading, MangaPopular } from "@/components/manga/home-rail";
import { HomeSections, type HomeSection } from "@/components/home/home-sections";
import { MoviesHomeRail } from "@/components/movies/home-rail";
import { continueWatching } from "@/lib/movie-user";
import { movieKW } from "@/lib/movie-resume";
import { FreshSchedule, type Slot } from "@/components/home/fresh-schedule";
import { TopRow } from "@/components/home/top-row";
import { Shelf, ShelfSkeleton, type ShelfItem } from "@/components/shelf";

export const metadata = { title: "Explore" };

const toItems = (xs: Anime[]): ShelfItem[] => xs.map((a) => ({ id: a.id, title: a.title, image: a.posterSm }));

export default async function Home() {
  const me = await requireMember();
  const [{ trending, season, top, popular }, catalogTop, resume, local] = await Promise.all([
    getHome(),
    getCatalogTop(300),
    all<Resume>(
      `select mal_id, episode, position, duration, title, image, updated_at from watch_progress w
       where user_id = ? and updated_at = (select max(updated_at) from watch_progress where user_id = w.user_id and mal_id = w.mal_id)
       order by updated_at desc limit 8`,
      me.id,
    ),
    all<{ mal_id: number; title: string; image: string | null; views: number }>(
      `select mal_id, max(title) as title, max(image) as image, sum(views) as views from daily_views
       where day >= date('now', '-7 days') group by mal_id order by views desc limit 10`,
    ),
  ]);

  // Shows you are watching on your list (e.g. synced from AniList) that you haven't started here:
  // "Keep watching" picks them up at the next episode, so a synced list is a continue row too.
  const have = new Set(resume.map((r) => r.mal_id));
  const fromList = (await all<{ mal_id: number; progress: number; episodes: number | null; title: string; image: string | null }>(
    `select mal_id, progress, episodes, title, image from library where user_id = ? and (status = 'watching' or rewatching = 1) and kind is not 'Movie'
     order by updated_at desc limit 12`,
    me.id,
  ).catch(() => [])).filter((r) => !have.has(r.mal_id) && (!r.episodes || r.progress < r.episodes))
    .map((r): Resume => ({ mal_id: r.mal_id, episode: r.progress + 1, position: 0, duration: 0, title: r.title, image: r.image }));
  resume.push(...fromList.slice(0, Math.max(0, 12 - resume.length)));

  // One "Keep watching" rail for everything: anime, films and series, newest first (films and series are fetched here because
  // they live in their own tables; a missing table just means none)
  const moviesKeep = await continueWatching(me.id, 10);
  const keepAnime = resume.map(animeKW);
  const keep = [...keepAnime, ...moviesKeep.map(movieKW)].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 14);

  // One pool feeds the hero and the genre rows. Everything on the page is a
  // horizontal row — no sidebars, no dashboard panels.
  const seen = new Set<number>();
  const pool = [...trending, ...season, ...popular, ...top, ...catalogTop].filter((m) => !seen.has(m.id) && seen.add(m.id));
  const since = Date.now() - 86400_000;
  const slots: Slot[] = [...trending, ...season]
    .filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i)
    .flatMap((a) => {
      const at = nextAiring(a, since);
      return at ? [{ id: a.id, title: a.title, poster: a.posterSm, color: a.color, at, ep: episodeAt(a, at) }] : [];
    });
  const ranked: ShelfItem[] = local.map((r) => ({ id: r.mal_id, title: r.title, image: r.image }));

  // Top genres across the pool → a content row each (Netflix's "Because you
  // watch X" / genre rows), replacing the old browse-by-genre sidebar.
  const genreCount: Record<string, number> = {};
  pool.forEach((m) => m.genres.forEach((g) => (genreCount[g] = (genreCount[g] || 0) + 1)));
  const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g);
  const empty = pool.length === 0;

  // Everything under the hero is a movable row (see HomeSections). Continue-watching and
  // continue-reading come first so picking up where you left off never takes a long scroll.
  const sections: HomeSection[] = [
    { id: "keep-watching", label: "Keep watching", node: <KeepWatching items={keep} historyHref={moviesKeep.length > keepAnime.length ? "/movies/history" : "/box/history"} /> },
    { id: "keep-reading", label: "Keep reading", node: <MangaKeepReading /> },
    { id: "queue", label: "Your queue", node: <QueueRail /> },
    { id: "top10", label: "Top 10 this week", node: <TopRow eyebrow="Most played here" title="Top 10 this week" items={ranked.length ? ranked : toItems(trending)} href="/rankings" /> },
    { id: "trending", label: "Trending", node: <Shelf eyebrow="Hot right now" title="Trending" items={toItems(trending)} href="/browse" /> },
    { id: "for-you", label: "For you", node: <Suspense fallback={<ShelfSkeleton />}><ForYou userId={me.id} /></Suspense> },
    { id: "season", label: "New this season", node: <Shelf eyebrow="Just dropped" title="New this season" items={toItems(season)} href="/seasonal" /> },
    ...topGenres.map((g) => ({ id: `genre-${g}`, label: `Genre: ${g}`, node: <Shelf eyebrow="Genre" title={g} items={toItems(pool.filter((m) => m.genres.includes(g)).slice(0, 18))} href="/browse" /> })),
    { id: "popular-manga", label: "Popular manga", node: <MangaPopular /> },
    { id: "movies", label: "Movies", node: <Suspense fallback={null}><MoviesHomeRail /></Suspense> },
    { id: "greats", label: "All-time greats", node: <Shelf eyebrow="Timeless" title="All-time greats" items={toItems(top)} href="/rankings" /> },
    { id: "schedule", label: "Airing schedule", node: <FreshSchedule items={slots} /> },
  ];

  return (
    <>
      {empty ? (
        <div className="mx-auto mt-10 max-w-[560px] rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center">
          <p className="text-2xl font-extrabold tracking-tight text-frost-deep">The listings are napping.</p>
          <p className="mt-2 text-plum-muted">The catalog is empty right now. If you run cupcake, fill it with <code className="rounded bg-cream-tint px-1.5 font-mono text-[12.5px] text-frost-text">npm run sync</code> (see the README), then refresh.</p>
        </div>
      ) : (
        // One column, one rhythm: a full-width hero, then nothing but rows —
        // hero and rows share the same container so every left edge lines up.
        <div className="mx-auto flex max-w-[1500px] flex-col gap-9 px-4 pb-16 pt-4 sm:px-6">
          <Hero items={trending.slice(0, 5)} />
          <HomeSections sections={sections} />
        </div>
      )}
    </>
  );
}

/** "For you" rails, built from the member's own library. Streams in after the page. */
async function ForYou({ userId }: { userId: string }) {
  const rails = await getForYou(userId);
  if (!rails.length) return null;
  return (
    <>
      {rails.map((r) => (
        <Shelf key={r.title} eyebrow={r.eyebrow} title={r.title} items={r.items} />
      ))}
    </>
  );
}

