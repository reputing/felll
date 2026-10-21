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
// --anime also accepts an AniList id ("anilist:154587").
//
// Uploads use tus (resumable), so multi-GB masters are fine. The video is
// created with signed URLs required; the site signs a token per play.

import { createReadStream, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import * as tus from "tus-js-client";
import { adminClient, arg, requireEnv, sleep } from "./lib";

const API = "https://api.cloudflare.com/client/v4";

async function resolveAnimeId(db: ReturnType<typeof adminClient>, ref: string): Promise<number> {
  const query = ref.startsWith("anilist:")
    ? db.from("anime").select("id").eq("anilist_id", Number(ref.slice(8)))
    : db.from("anime").select("id").eq("slug", ref);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No anime matches ${ref}. Run the catalog sync first.`);
  return data.id;
}

function uploadToStream(file: string, accountId: string, token: string): Promise<string> {
  const size = statSync(file).size;
  let uid: string | null = null;

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(createReadStream(file), {
      endpoint: `${API}/accounts/${accountId}/stream`,
      headers: { Authorization: `Bearer ${token}` },
      uploadSize: size,
      // Cloudflare requires a multiple of 256 KiB, at least 5 MiB.
      chunkSize: 50 * 1024 * 1024,
      retryDelays: [0, 3000, 10000, 30000],
      metadata: { name: basename(file), requiresignedurls: "true" },
      onAfterResponse(_req, res) {
        uid ??= res.getHeader("stream-media-id") ?? null;
      },
      onProgress(sent, total) {
        process.stdout.write(`\rUploading ${((sent / total) * 100).toFixed(1)}%`);
      },
      onError: reject,
      onSuccess() {
        process.stdout.write("\n");
        uid ??= new URL(upload.url!).pathname.split("/").pop() ?? null;
        if (uid) resolve(uid);
        else reject(new Error("Upload finished but Stream returned no video id"));
      },
    });
    upload.start();
  });
}

async function streamApi(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}/accounts/${requireEnv("CLOUDFLARE_ACCOUNT_ID")}/stream${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${requireEnv("CLOUDFLARE_STREAM_API_TOKEN")}`, ...init.headers },
  });
  const body = await res.json();
  if (!body.success) throw new Error(`Stream API ${path}: ${JSON.stringify(body.errors)}`);
  return body.result;
}

async function waitUntilReady(uid: string): Promise<number | null> {
  for (;;) {
    const video = await streamApi(`/${uid}`);
    if (video.status?.state === "error") throw new Error(`Stream could not encode ${uid}: ${video.status.errorReasonText}`);
    if (video.readyToStream) return video.duration > 0 ? Math.round(video.duration) : null;
    process.stdout.write(`\rEncoding ${video.status?.pctComplete ?? 0}%   `);
    await sleep(10_000);
  }
}

async function main() {
  const animeRef = arg("anime");
  const number = Number(arg("episode"));
  const file = arg("file");
  const hlsUrl = arg("hls-url");
  if (!animeRef || !Number.isFinite(number) || (!file === !hlsUrl)) {
    throw new Error("Usage: --anime <slug|anilist:id> --episode <n> (--file <path> | --hls-url <url>)");
  }
  const audio = arg("audio") ?? "sub";
  const db = adminClient();
  const animeId = await resolveAnimeId(db, animeRef);

  let streamUid: string | null = null;
  let duration: number | null = null;
  if (file) {
    streamUid = await uploadToStream(file, requireEnv("CLOUDFLARE_ACCOUNT_ID"), requireEnv("CLOUDFLARE_STREAM_API_TOKEN"));
    console.log(`Uploaded as ${streamUid}; waiting for encoding…`);
    duration = await waitUntilReady(streamUid);
    console.log("\nReady to stream.");

    // Captions uploaded to Stream are served inside the HLS manifest.
    const captions = arg("captions");
    if (captions) {
      const [lang, path] = captions.split(/:(.+)/);
      const form = new FormData();
      form.append("file", new Blob([readFileSync(path)]), basename(path));
      await streamApi(`/${streamUid}/captions/${lang}`, { method: "PUT", body: form });
      console.log(`Added ${lang} captions.`);
    }
  }

  const { data: episode, error: epError } = await db
    .from("episodes")
    .upsert(
      {
        anime_id: animeId,
        number,
        ...(arg("title") ? { title: arg("title") } : {}),
        ...(duration ? { duration_seconds: duration } : {}),
      },
      { onConflict: "anime_id,number" },
    )
    .select("id")
    .single();
  if (epError) throw epError;

  const { error: srcError } = await db.from("video_sources").insert({
    episode_id: episode.id,
    provider: streamUid ? "cloudflare_stream" : "hls_url",
    stream_uid: streamUid,
    hls_url: hlsUrl ?? null,
    label: arg("label") ?? "Main",
    audio,
    priority: Number(arg("priority")) || 0,
    status: "ready",
  });
  if (srcError) throw srcError;

  console.log(`Episode ${number} (${audio}) is live.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
