import Link from "next/link";
import { notFound } from "next/navigation";
import { Player } from "@/components/Player";
import { getAnime, getWatchEpisodes, getWatchSources } from "@/lib/catalog";
import { displayTitle, getTitleLanguage } from "@/lib/titles";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ep?: string; lang?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props) {
  const anime = await getAnime((await params).slug);
  const ep = (await searchParams).ep ?? "1";
  return { title: anime ? `${anime.title_english || anime.title_romaji} – Episode ${ep}` : "Not found" };
}

export default async function WatchPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ep, lang } = await searchParams;
  const anime = await getAnime(slug);
  if (!anime) notFound();

  const [{ episodes, providers }, titleLang] = await Promise.all([getWatchEpisodes(anime), getTitleLanguage()]);

  if (episodes.length === 0) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-xl font-semibold">{displayTitle(anime, titleLang)}</h1>
        <p className="mx-auto mt-3 max-w-md text-muted">
          No streamable episodes were found for this title right now. External providers can be
          temporarily unavailable — try again later, or pick another title.
        </p>
        <Link href={`/anime/${anime.slug}`} className="mt-6 inline-block text-accent">← Back to details</Link>
      </div>
    );
  }

  const index = Math.max(0, episodes.findIndex((e) => String(e.number) === (ep ?? String(episodes[0]?.number))));
  const episode = episodes[index];
  if (!episode) notFound();

  const { sources, subtitles } = await getWatchSources(anime, episode, providers);

  const next = episodes[index + 1];
  const prev = episodes[index - 1];
  const href = (n: number) => `/watch/${anime.slug}?ep=${n}${lang ? `&lang=${lang}` : ""}`;

  return (
    <div className="group/watch" data-theater="">
      <div className="grid gap-6 lg:grid-cols-[1fr_300px] group-data-[theater]/watch:lg:grid-cols-1">
        <div className="space-y-4">
          <Player
            key={episode.number}
            animeId={anime.id}
            episodeKey={`${anime.id}:${episode.number}`}
            sources={sources}
            subtitles={subtitles}
            intro={{ start: episode.intro_start, end: episode.intro_end }}
            outroStart={episode.outro_start}
            nextHref={next ? href(next.number) : null}
            defaultAudio={lang === "dub" ? "dub" : lang === "raw" ? "raw" : undefined}
          />

          <div className="flex items-center justify-between gap-4">
            <div>
              <Link href={`/anime/${anime.slug}`} className="text-lg font-semibold hover:text-accent">
                {displayTitle(anime, titleLang)}
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

          <div className="text-center text-xs leading-relaxed text-zinc-500">
            You are watching <span className="font-bold text-accent">Episode {episode.number}</span>.
            If the current server is not working, please try switching to other servers.
          </div>
        </div>

        <aside className="max-h-[70vh] overflow-y-auto rounded-lg bg-panel">
          <div className="sticky top-0 z-10 flex items-center justify-between bg-panel px-4 py-3">
            <h2 className="font-semibold">Episodes</h2>
            <span className="rounded-md border border-white/[0.07] bg-white/[0.05] px-2 py-0.5 text-xs font-semibold text-white/70">
              {episodes.length}
            </span>
          </div>
          <ol>
            {episodes.map((e) => (
              <li key={e.number}>
                <Link
                  href={href(e.number)}
                  aria-current={e.number === episode.number ? "page" : undefined}
                  className={`flex gap-3 px-4 py-2 text-sm hover:bg-line ${e.number === episode.number ? "bg-line text-accent" : ""}`}
                >
                  {e.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.thumbnail_url} alt="" className="h-12 w-20 shrink-0 rounded object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-12 w-8 shrink-0 items-center justify-center text-muted">{e.number}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">EP {String(e.number).padStart(2, "0")}</span>
                      {e.filler && <span className="rounded bg-amber-900/40 px-1 text-[10px]">Filler</span>}
                    </div>
                    <p className="truncate text-muted">{e.title ?? `Episode ${e.number}`}</p>
                    {(e.sub || e.dub) && (
                      <div className="mt-0.5 flex gap-1.5 text-[10px]">
                        {e.sub && <span className="rounded bg-white/10 px-1 py-px">Sub</span>}
                        {e.dub && <span className="rounded bg-white/10 px-1 py-px">Dub</span>}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
