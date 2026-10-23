import { Suspense } from "react";
import { requireMember } from "@/lib/auth";
import { all } from "@/lib/db";
import { episodeAt, getCatalogCount, getCatalogTop, getForYou, getHome, nextAiring } from "@/lib/jikan";
import { Hero } from "@/components/home/hero";
import { KeepWatching, type Resume } from "@/components/home/keep-watching";
import { QueueRail } from "@/components/queue/queue-rail";
import { MangaHomeRail } from "@/components/manga/home-rail";
import { MoviesHomeRail } from "@/components/movies/home-rail";
import { Catalog } from "@/components/home/catalog";
import { FreshSchedule, type Slot } from "@/components/home/fresh-schedule";
import { CloserLook } from "@/components/home/closer-look";
import { TopTen, type Ranked } from "@/components/home/top-ten";
import { LibrarySidebar } from "@/components/home/library-sidebar";
import { FriendsNow } from "@/components/home/friends-now";
import { Shelf, ShelfSkeleton } from "@/components/shelf";

export const metadata = { title: "Explore" };

export default async function Home() {
  const me = await requireMember();
  const [{ trending, season, top, popular }, catalogTop, catalogCount, resume, local] = await Promise.all([
    getHome(),
    getCatalogTop(300),
    getCatalogCount(),
    all<Resume>(
      `select mal_id, episode, position, duration, title, image from watch_progress w
       where user_id = ? and updated_at = (select max(updated_at) from watch_progress where user_id = w.user_id and mal_id = w.mal_id)
       order by updated_at desc limit 8`,
      me.id,
    ),
    all<{ mal_id: number; title: string; image: string | null; views: number }>(
      `select mal_id, max(title) as title, max(image) as image, sum(views) as views from daily_views
       where day >= date('now', '-7 days') group by mal_id order by views desc limit 10`,
    ),
  ]);

  // The curated rows give the hero and the airing/season flavour; the catalog
  // slice fills the box out to hundreds so Explore reflects the real library.
  const seen = new Set<number>();
  const pool = [...trending, ...season, ...popular, ...top, ...catalogTop].filter((m) => !seen.has(m.id) && seen.add(m.id));
  const total = Math.max(catalogCount, pool.length);
  const since = Date.now() - 86400_000;
  const slots: Slot[] = [...trending, ...season]
    .filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i)
    .flatMap((a) => {
      const at = nextAiring(a, since);
      return at ? [{ id: a.id, title: a.title, poster: a.posterSm, color: a.color, at, ep: episodeAt(a, at) }] : [];
    });
  const ranked: Ranked[] = local.map((r) => ({ id: r.mal_id, title: r.title, image: r.image, note: `${r.views} play${r.views === 1 ? "" : "s"} this week` }));
  const empty = pool.length === 0;

  return (
    <>
      <div className="mx-auto flex max-w-[1600px] flex-wrap justify-between gap-3 px-7 pt-3 text-plum-muted">
        <span className="eyebrow">Anime / TV &amp; Film</span>
        <span className="text-xs font-semibold">Fresh picks, trending titles and {slots.length} shows airing this week.</span>
      </div>
      {empty ? (
        <div className="mx-auto mt-10 max-w-[560px] rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center">
          <p className="text-2xl font-extrabold tracking-tight text-frost-deep">The listings are napping.</p>
          <p className="mt-2 text-plum-muted">The catalog is empty right now. If you run cupcake, fill it with <code className="rounded bg-cream-tint px-1.5 font-mono text-[12.5px] text-frost-text">npm run sync</code> (see the README), then refresh.</p>
        </div>
      ) : (
        <div className="mx-auto flex max-w-[1560px] flex-col gap-[22px] px-3 pb-12 pt-[22px] sm:px-5 lg:flex-row lg:items-start">
          <LibrarySidebar pool={pool} total={total} className="hidden lg:sticky lg:top-[100px] lg:block lg:w-[250px] lg:flex-none" />
          <main className="flex min-w-0 flex-1 flex-col gap-[30px]">
            <Hero items={trending.slice(0, 5)} />
            <KeepWatching items={resume} />
            <QueueRail />
            <Catalog pool={pool} total={total} />
            <Suspense fallback={<ShelfSkeleton />}>
              <ForYou userId={me.id} />
            </Suspense>
            <MangaHomeRail />
            <Suspense fallback={null}><MoviesHomeRail /></Suspense>
            <FreshSchedule items={slots} />
          </main>
          <aside aria-label="details" className="flex flex-col gap-4 lg:sticky lg:top-[100px] lg:w-[330px] lg:flex-none">
            <CloserLook pool={pool} />
            <Suspense fallback={null}><FriendsNow userId={me.id} /></Suspense>
            <TopTen lists={{ trending, season, top }} local={ranked} />
          </aside>
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

