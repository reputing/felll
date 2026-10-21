// Uploads one episode you hold the rights to and makes it playable.
//
//   npm run upload -- --anime frieren-beyond-journeys-end-k3x9qa --episode 1 \
//     --file ./frieren-01.mkv [--title "The Journey's End"] [--audio sub|dub|raw] \
//     [--label "Main"] [--priority 0] [--captions en:./frieren-01.en.vtt]
//
// Or register an HLS stream you host yourself (e.g. on R2) instead of uploading:
//
//   npm run upload -- --anime <slug> --episode 1 --hls-url https://media.example.com/f/01/master.m3u8
//
// --anime also accepts an AniList id ("anilist:154587"). For whole seasons,
// use `npm run upload:folder` instead.

import { arg } from "./lib";
import { d1Query } from "./d1";
import { resolveAnimeId, uploadEpisodeFile, type Audio } from "./uploader";

async function main() {
  const animeRef = arg("anime");
  const number = Number(arg("episode"));
  const file = arg("file");
  const hlsUrl = arg("hls-url");
  if (!animeRef || !Number.isFinite(number) || !file === !hlsUrl) {
    throw new Error("Usage: --anime <slug|anilist:id> --episode <n> (--file <path> | --hls-url <url>)");
  }
  const audio = (arg("audio") ?? "sub") as Audio;
  const label = arg("label") ?? "Main";
  const priority = Number(arg("priority")) || 0;
  const animeId = await resolveAnimeId(animeRef);
  if (!animeId) throw new Error(`No anime matches ${animeRef}. Run the catalog sync first.`);

  if (file) {
    const captions = arg("captions");
    const [lang, path] = captions?.split(/:(.+)/) ?? [];
    const result = await uploadEpisodeFile({
      animeId,
      number,
      file,
      audio,
      label,
      priority,
      title: arg("title"),
      captions: captions ? [{ lang, path }] : [],
    });
    console.log(result === "skipped" ? `Episode ${number} (${audio}, ${label}) is already live.` : `Episode ${number} (${audio}) is live.`);
    return;
  }

  const episodeRows = await d1Query<{ id: number }>(
    `INSERT INTO episodes (anime_id, number, title) VALUES (?, ?, ?)
     ON CONFLICT (anime_id, number) DO UPDATE SET title = COALESCE(excluded.title, episodes.title)
     RETURNING id`,
    [animeId, number, arg("title") ?? null],
  );
  await d1Query(
    `INSERT INTO video_sources (episode_id, provider, hls_url, label, audio, priority, status)
     VALUES (?, 'hls_url', ?, ?, ?, ?, 'ready')`,
    [episodeRows[0].id, hlsUrl, label, audio, priority],
  );
  console.log(`Episode ${number} (${audio}) is live.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
