import Link from "next/link";
import { notFound } from "next/navigation";
import { Player } from "@/components/Player";
import { getAnime, getEpisodes, getSources, getSubtitles } from "@/lib/catalog";
import { displayTitle, getTitleLanguage } from "@/lib/titles";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ep?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props) {
  const anime = await getAnime((await params).slug);
  const ep = (await searchParams).ep ?? "1";
  return { title: anime ? `${anime.title_english || anime.title_romaji} – Episode ${ep}` : "Not found" };
}

export default async function WatchPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ep } = await searchParams;
  const anime = await getAnime(slug);
  if (!anime) notFound();

  const [episodes, lang] = await Promise.all([getEpisodes(anime.id), getTitleLanguage()]);
  const index = Math.max(0, episodes.findIndex((e) => String(e.number) === (ep ?? String(episodes[0]?.number))));
  const episode = episodes[index];
  if (!episode) notFound();

  const [sources, subtitles] = await Promise.all([getSources(episode.id), getSubtitles(episode.id)]);
  const next = episodes[index + 1];
  const prev = episodes[index - 1];
  const href = (n: number) => `/watch/${anime.slug}?ep=${n}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <Player
          key={episode.id}
          animeId={anime.id}
          episodeKey={`${anime.id}:${episode.number}`}
          sources={sources}
          subtitles={subtitles}
          intro={{ start: episode.intro_start, end: episode.intro_end }}
          outroStart={episode.outro_start}
          nextHref={next ? href(next.number) : null}
        />
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link href={`/anime/${anime.slug}`} className="text-lg font-semibold hover:text-accent">
              {displayTitle(anime, lang)}
            </Link>
            <p className="text-sm text-muted">
              Episode {episode.number}
              {episode.title ? ` · ${episode.title}` : ""}
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            {prev && <Link href={href(prev.number)} className="rounded-md border border-line px-3 py-1.5">← Prev</Link>}
            {next && <Link href={href(next.number)} className="rounded-md bg-accent px-3 py-1.5 font-semibold text-black">Next →</Link>}
          </div>
        </div>
        {episode.synopsis && <p className="text-sm text-gray-300">{episode.synopsis}</p>}
      </div>

      <aside className="max-h-[70vh] overflow-y-auto rounded-lg bg-panel">
        <h2 className="sticky top-0 bg-panel px-4 py-3 font-semibold">Episodes</h2>
        <ol>
          {episodes.map((e) => (
            <li key={e.id}>
              <Link
                href={href(e.number)}
                aria-current={e.id === episode.id ? "page" : undefined}
                className={`flex gap-3 px-4 py-2 text-sm hover:bg-line ${e.id === episode.id ? "bg-line text-accent" : ""}`}
              >
                <span className="w-8 shrink-0 text-muted">{e.number}</span>
                <span className="truncate">{e.title ?? `Episode ${e.number}`}</span>
              </Link>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
