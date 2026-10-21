import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { currentSeason, episodeAt, getUpcoming, getWholeSeason, nextAiring, premiereAt, SEASONS, type Anime, type SeasonName } from "@/lib/jikan";
import { SeasonBoard, type SeasonItem } from "@/components/seasonal/board";
import { cn } from "@/lib/utils";

export const metadata = { title: "Seasonal" };

const label = (s: string) => s[0].toUpperCase() + s.slice(1);
function shift(year: number, season: SeasonName, by: number) {
  const i = SEASONS.indexOf(season) + by;
  return { year: year + Math.floor(i / 4), season: SEASONS[((i % 4) + 4) % 4] };
}

type SP = { year?: string; season?: string };

export default async function Seasonal({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const cur = currentSeason();
  const upcoming = sp.season === "upcoming";
  const season = (SEASONS as readonly string[]).includes(sp.season ?? "") ? (sp.season as SeasonName) : cur.season;
  const year = Number(sp.year) || cur.year;
  const prev = shift(year, season, -1), next = shift(year, season, 1);
  const href = (y: number, s: string) => `/seasonal?year=${y}&season=${s}`;
  const tabs = [
    { label: "This season", href: "/seasonal", on: !upcoming && year === cur.year && season === cur.season },
    { label: `${label(shift(cur.year, cur.season, 1).season)} ${shift(cur.year, cur.season, 1).year}`, href: href(shift(cur.year, cur.season, 1).year, shift(cur.year, cur.season, 1).season), on: !upcoming && year === shift(cur.year, cur.season, 1).year && season === shift(cur.year, cur.season, 1).season },
    { label: "Upcoming & TBA", href: "/seasonal?season=upcoming", on: upcoming },
  ];

  return (
    <div className="mx-auto flex max-w-[1560px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <section className="relative overflow-hidden rounded-shell border-1.5 border-night-line bg-night p-6 text-night-text sm:p-8">
        <div aria-hidden className="absolute -right-20 -top-24 size-[360px] rounded-full bg-frost/25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 left-1/3 size-[300px] rounded-full bg-sprinkle-lilac/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[.16em] text-frost">Seasonal chart · drop timers in your time zone</div>
            <h1 className="mt-2 text-[clamp(38px,5vw,64px)] font-extrabold leading-none tracking-[-2.4px]">{upcoming ? "Coming soon" : `${label(season)} ${year}`}</h1>
            <p className="mt-2 max-w-[54ch] text-[14px] text-night-muted">Every show in the season, ranked how you like, with a live countdown to the next episode or premiere.</p>
          </div>
          {!upcoming && (
            <div className="flex items-center gap-2">
              <Link href={href(prev.year, prev.season)} className="flex h-11 items-center gap-1 rounded-full border-1.5 border-night-edge px-4 text-[13px] font-bold hover:border-frost"><ChevronLeft className="size-4" />{label(prev.season)} {prev.year}</Link>
              <Link href={href(next.year, next.season)} className="flex h-11 items-center gap-1 rounded-full border-1.5 border-night-edge px-4 text-[13px] font-bold hover:border-frost">{label(next.season)} {next.year}<ChevronRight className="size-4" /></Link>
            </div>
          )}
        </div>
        <div className="relative mt-5 flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <Link key={t.label} href={t.href} className={cn("flex h-9 items-center rounded-full border border-night-edge px-4 text-[13px] font-bold", t.on ? "border-frost bg-frost text-frost-ink" : "hover:border-frost")}>{t.label}</Link>
          ))}
        </div>
      </section>
      <Suspense key={`${year}-${season}-${upcoming}`} fallback={<BoardSkeleton />}>
        <Board year={year} season={season} upcoming={upcoming} />
      </Suspense>
    </div>
  );
}

async function Board({ year, season, upcoming }: { year: number; season: SeasonName; upcoming: boolean }) {
  const list: Anime[] = upcoming ? await getUpcoming() : await getWholeSeason(year, season);
  if (!list.length) return <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">No listings for this season yet, or MyAnimeList is having a moment.</p>;
  const items: SeasonItem[] = list.map((a) => {
    const nextAt = nextAiring(a);
    return { ...a, nextAt, nextEp: nextAt ? episodeAt(a, nextAt) : null, premiere: premiereAt(a) };
  });
  return <SeasonBoard items={items} upcoming={upcoming} />;
}

function BoardSkeleton() {
  return (
    <div className="grid gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 9 }, (_, i) => <div key={i} className="h-[200px] rounded-3xl skeleton" />)}
    </div>
  );
}
