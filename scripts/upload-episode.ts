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

import { adminClient, arg } from "./lib";
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
  const db = adminClient();
  const animeId = await resolveAnimeId(db, animeRef);
  if (!animeId) throw new Error(`No anime matches ${animeRef}. Run the catalog sync first.`);

  if (file) {
    const captions = arg("captions");
    const [lang, path] = captions?.split(/:(.+)/) ?? [];
    const result = await uploadEpisodeFile(db, {
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

  const { data: episode, error: epError } = await db
    .from("episodes")
    .upsert({ anime_id: animeId, number, ...(arg("title") ? { title: arg("title") } : {}) }, { onConflict: "anime_id,number" })
    .select("id")
    .single();
  if (epError) throw epError;
  const { error } = await db.from("video_sources").insert({
    episode_id: episode.id,
    provider: "hls_url",
    hls_url: hlsUrl,
    label,
    audio,
    priority,
    status: "ready",
  });
  if (error) throw error;
  console.log(`Episode ${number} (${audio}) is live.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
