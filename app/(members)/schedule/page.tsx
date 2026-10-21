import { Suspense } from "react";
import { episodeAt, getScheduleDay, nextAiring, WEEKDAYS } from "@/lib/jikan";
import { PageHead } from "@/components/page-head";
import { ScheduleBoard, type Airing } from "@/components/schedule/board";

export const metadata = { title: "Schedule" };

export default function Schedule() {
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="Weekly lineup · your time zone" title="Airing schedule" sub="Every episode dropping this week, with a timer on each." />
      <Suspense fallback={<div className="h-[480px] rounded-box skeleton" />}>
        <Board />
      </Suspense>
    </div>
  );
}

async function Board() {
  const days = await Promise.all(WEEKDAYS.map((d) => getScheduleDay(d)));
  const seen = new Set<number>();
  const items: Airing[] = days.flat().flatMap((a) => {
    if (seen.has(a.id)) return [];
    seen.add(a.id);
    const at = nextAiring(a, Date.now() - 7 * 86400_000);
    return at ? [{ id: a.id, title: a.title, poster: a.posterSm, color: a.color, at, ep: episodeAt(a, at), episodes: a.episodes, studio: a.studio, score: a.score }] : [];
  });
  return <ScheduleBoard items={items} />;
}
