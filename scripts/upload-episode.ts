// Uploads one episode you hold the rights to and makes it playable.
//
//   npm run upload -- --anime 52991 --episode 1 \
//     --file ./frieren-01.mkv [--title "The Journey's End"] [--audio sub|dub|raw] \
//     [--label "Main"] [--priority 0] [--captions en:./frieren-01.en.vtt]
//
// Or register an HLS stream you host yourself (e.g. on R2) instead of uploading:
//
//   npm run upload -- --anime 52991 --episode 1 --hls-url https://media.example.com/f/01/master.m3u8
//
// Skip buttons: --intro 85-175 (seconds) and --outro 1310. Pass only those
// (no --file / --hls-url) to set them on an episode that's already up.
//
// --anime is the MyAnimeList id (the number in the cupcake or MAL url; a url
// works too). For whole seasons, use `npm run upload:folder` instead.

import { arg, d1, malIdOf, titleOf } from "./lib";
import { episodeId, uploadEpisodeFile, type Audio } from "./uploader";

async function main() {
  const animeRef = arg("anime");
  const number = Number(arg("episode"));
  const file = arg("file");
  const hlsUrl = arg("hls-url");
  const intro = arg("intro")?.match(/^(\d+)-(\d+)$/);
  const outro = arg("outro") ? Number(arg("outro")) : undefined;
  const timingsOnly = !file && !hlsUrl && (intro || outro != null);
  if (!animeRef || !Number.isFinite(number) || (!timingsOnly && !file === !hlsUrl)) {
    throw new Error("Usage: --anime <mal id> --episode <n> (--file <path> | --hls-url <url>)");
  }
  const audio = (arg("audio") ?? "sub") as Audio;
  const label = arg("label") ?? "Main";
  const priority = Number(arg("priority")) || 0;
  const malId = malIdOf(animeRef);
  if (!malId) throw new Error(`${animeRef} isn't a MyAnimeList id (e.g. 52991, or a /anime/52991 url).`);
  console.log(`${(await titleOf(malId)) ?? `MAL ${malId}`}, episode ${number}`);
  if (intro || outro != null) {
    const id = await episodeId(malId, number, arg("title"));
    await d1(
      "update episodes set intro_start = coalesce(?, intro_start), intro_end = coalesce(?, intro_end), outro_start = coalesce(?, outro_start) where id = ?",
      intro ? Number(intro[1]) : null, intro ? Number(intro[2]) : null, outro ?? null, id,
    );
    console.log("Skip markers saved.");
    if (timingsOnly) return;
  }

  if (file) {
    const captions = arg("captions");
    const [lang, path] = captions?.split(/:(.+)/) ?? [];
    const result = await uploadEpisodeFile({
      malId,
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

  const epId = await episodeId(malId, number, arg("title"));
  await d1(
    `insert into video_sources (episode_id, provider, hls_url, label, audio, priority, status) values (?, 'hls_url', ?, ?, ?, ?, 'ready')`,
    epId, hlsUrl, label, audio, priority,
  );
  console.log(`Episode ${number} (${audio}) is live.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
