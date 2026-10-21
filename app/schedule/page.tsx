import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { getSchedule } from "@/lib/catalog";
import { displayTitle, getTitleLanguage } from "@/lib/titles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Airing schedule" };

const DAY = { weekday: "long", month: "short", day: "numeric" } as const;
const TIME = { hour: "2-digit", minute: "2-digit" } as const;

export default async function SchedulePage() {
  const lang = await getTitleLanguage();
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  const items = await getSchedule(from, to);

  const days = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.next_episode_at.slice(0, 10);
    days.set(key, [...(days.get(key) ?? []), item]);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Airing schedule</h1>
      {days.size === 0 && <p className="text-muted">Nothing scheduled in the next 7 days.</p>}
      {[...days.entries()].map(([day, list]) => (
        <section key={day}>
          <h2 className="mb-3 text-lg font-semibold">
            <LocalTime iso={list[0].next_episode_at} options={DAY} />
          </h2>
          <ul className="divide-y divide-line rounded-lg bg-panel">
            {list.map((a) => (
              <li key={a.id}>
                <Link href={`/anime/${a.slug}`} className="flex items-center gap-4 px-4 py-3 hover:bg-line">
                  <span className="w-14 shrink-0 font-mono text-sm text-accent">
                    <LocalTime iso={a.next_episode_at} options={TIME} />
                  </span>
                  <span className="flex-1 truncate">{displayTitle(a, lang)}</span>
                  <span className="text-sm text-muted">Episode {a.next_episode}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
