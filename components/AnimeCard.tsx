import { AppLink as Link } from "@/components/AppLink";
import { displayTitle, type TitleLanguage } from "@/lib/titles";
import { durationLabel, formatLabel, scoreLabel } from "@/lib/format";
import type { AnimeCard as Card } from "@/lib/types";

export function AnimeCard({ anime, lang }: { anime: Card; lang: TitleLanguage }) {
  const title = displayTitle(anime, lang);
  return (
    <Link href={`/anime/${anime.slug}`} className="group block">
      <div
        className="relative aspect-[2/3] overflow-hidden rounded-lg bg-panel"
        style={{ backgroundColor: anime.color ?? undefined }}
      >
        {anime.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={anime.cover_url}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        )}
        <div className="absolute inset-x-0 top-0 flex justify-between p-2 text-xs font-semibold">
          {anime.average_score != null && (
            <span className="rounded bg-black/70 px-1.5 py-0.5">★ {scoreLabel(anime.average_score)}</span>
          )}
          {anime.age_rating && <span className="rounded bg-black/70 px-1.5 py-0.5">{anime.age_rating}</span>}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex gap-1 p-2 text-xs font-semibold">
          <span className="rounded bg-emerald-500/90 px-1.5 py-0.5 text-black" title="Subbed episodes">
            CC {anime.sub_episodes}
          </span>
          <span className="rounded bg-sky-400/90 px-1.5 py-0.5 text-black" title="Dubbed episodes">
            🎙 {anime.dub_episodes}
          </span>
          <span className="rounded bg-black/70 px-1.5 py-0.5" title="Total episodes">
            {anime.episodes_total ?? "?"}
          </span>
        </div>
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-medium group-hover:text-accent">{title}</h3>
      <p className="text-xs text-muted">
        {[formatLabel(anime.format), durationLabel(anime.duration_minutes)].filter(Boolean).join(" · ")}
      </p>
    </Link>
  );
}

export function AnimeGrid({ items, lang }: { items: Card[]; lang: TitleLanguage }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {items.map((a) => (
        <AnimeCard key={a.id} anime={a} lang={lang} />
      ))}
    </div>
  );
}
