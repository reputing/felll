import Link from "next/link";
import { notFound } from "next/navigation";
import { getAnime, getEpisodes } from "@/lib/catalog";
import { durationLabel, formatLabel, scoreLabel, statusLabel } from "@/lib/format";
import { displayTitle, getTitleLanguage } from "@/lib/titles";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const anime = await getAnime((await params).slug);
  return { title: anime ? anime.title_english || anime.title_romaji : "Not found" };
}

export default async function AnimePage({ params }: Props) {
  const anime = await getAnime((await params).slug);
  if (!anime) notFound();
  const [episodes, lang] = await Promise.all([getEpisodes(anime.id), getTitleLanguage()]);
  const title = displayTitle(anime, lang);
  const first = episodes[0];

  const facts: [string, string | null][] = [
    ["Format", formatLabel(anime.format)],
    ["Status", statusLabel(anime.status)],
    ["Season", anime.season && anime.season_year ? `${anime.season[0]}${anime.season.slice(1).toLowerCase()} ${anime.season_year}` : anime.season_year?.toString() ?? null],
    ["Episodes", anime.episodes_total?.toString() ?? null],
    ["Duration", durationLabel(anime.duration_minutes) || null],
    ["Score", scoreLabel(anime.average_score) || null],
    ["Rating", anime.age_rating],
    ["Studios", anime.studios.join(", ") || null],
    ["Native title", anime.title_native],
    ["Synonyms", anime.synonyms.join(", ") || null],
  ];

  return (
    <article className="space-y-8">
      {anime.banner_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={anime.banner_url} alt="" className="-mt-6 h-48 w-full rounded-b-xl object-cover opacity-60 sm:h-64" />
      )}
      <div className="flex flex-col gap-6 sm:flex-row">
        {anime.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={anime.cover_url} alt={title} className="w-48 shrink-0 self-start rounded-lg shadow-xl" />
        )}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">{title}</h1>
          {title !== anime.title_romaji && <p className="text-muted">{anime.title_romaji}</p>}
          <div className="flex flex-wrap gap-2">
            {anime.genres.map((g) => (
              <Link key={g} href={`/search?genres=${encodeURIComponent(g)}`} className="rounded-full bg-panel px-3 py-1 text-xs hover:text-accent">
                {g}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {first ? (
              <>
                <Link href={`/watch/${anime.slug}?ep=${first.number}&lang=sub`} className="rounded-lg bg-accent px-5 py-2 font-semibold text-black">
                  ▶ Watch Sub
                </Link>
                {anime.dub_episodes > 0 && (
                  <Link href={`/watch/${anime.slug}?ep=${first.number}&lang=dub`} className="rounded-lg border border-accent px-5 py-2 font-semibold text-accent">
                    ▶ Watch Dub
                  </Link>
                )}
              </>
            ) : (
              <span className="rounded-lg border border-line px-5 py-2 text-muted">Not available to stream yet</span>
            )}
            <span className="self-center text-sm text-muted">
              Sub {anime.sub_episodes} · Dub {anime.dub_episodes}
            </span>
          </div>
          {anime.description && <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-gray-300">{anime.description}</p>}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <h2 className="mb-3 text-xl font-semibold">Episodes</h2>
          {episodes.length === 0 ? (
            <p className="text-muted">No episodes uploaded yet.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8 md:grid-cols-10">
              {episodes.map((e) => (
                <Link
                  key={e.id}
                  href={`/watch/${anime.slug}?ep=${e.number}`}
                  title={e.title ?? `Episode ${e.number}`}
                  className={`rounded-md py-2 text-center text-sm hover:bg-accent hover:text-black ${e.is_filler ? "bg-amber-900/40" : "bg-panel"}`}
                >
                  {e.number}
                </Link>
              ))}
            </div>
          )}
          {anime.trailer_youtube_id && (
            <div className="mt-8">
              <h2 className="mb-3 text-xl font-semibold">Trailer</h2>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${anime.trailer_youtube_id}`}
                title="Trailer"
                allowFullScreen
                className="aspect-video w-full max-w-2xl rounded-lg"
              />
            </div>
          )}
        </section>
        <aside className="space-y-2 rounded-lg bg-panel p-4 text-sm">
          {facts.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <span className="text-muted">{k}</span>
              <span className="text-right">{v}</span>
            </div>
          ))}
          {anime.characters.length > 0 && (
            <div className="pt-2">
              <span className="text-muted">Characters</span>
              <p className="mt-1 flex flex-wrap gap-x-2">
                {anime.characters.map((c) => (
                  <Link key={c} href={`/search?character=${encodeURIComponent(c)}`} className="hover:text-accent">{c}</Link>
                ))}
              </p>
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}
