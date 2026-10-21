import { createReadStream, readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import * as tus from "tus-js-client";
import { requireEnv, sleep, type adminClient } from "./lib";

type Db = ReturnType<typeof adminClient>;
export type Audio = "sub" | "dub" | "raw";

const API = "https://api.cloudflare.com/client/v4";

/** Accepts a slug, "anilist:154587" or "anilist-154587". */
export async function resolveAnimeId(db: Db, ref: string): Promise<number | null> {
  const anilist = ref.match(/^anilist[:-](\d+)$/);
  const query = anilist
    ? db.from("anime").select("id").eq("anilist_id", Number(anilist[1]))
    : db.from("anime").select("id").eq("slug", ref);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

function uploadToStream(file: string): Promise<string> {
  const size = statSync(file).size;
  let uid: string | null = null;
  let lastLogged = -10;

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(createReadStream(file), {
      endpoint: `${API}/accounts/${requireEnv("CLOUDFLARE_ACCOUNT_ID")}/stream`,
      headers: { Authorization: `Bearer ${requireEnv("CLOUDFLARE_STREAM_API_TOKEN")}` },
      uploadSize: size,
      // Cloudflare requires a multiple of 256 KiB, at least 5 MiB.
      chunkSize: 50 * 1024 * 1024,
      retryDelays: [0, 3000, 10000, 30000, 60000],
      metadata: { name: basename(file), requiresignedurls: "true" },
      onAfterResponse(_req, res) {
        uid ??= res.getHeader("stream-media-id") ?? null;
      },
      onProgress(sent, total) {
        const pct = (sent / total) * 100;
        if (process.stdout.isTTY) process.stdout.write(`\r  uploading ${pct.toFixed(1)}%`);
        else if (pct - lastLogged >= 10) {
          lastLogged = pct;
          console.log(`  uploading ${pct.toFixed(0)}%`);
        }
      },
      onError: reject,
      onSuccess() {
        if (process.stdout.isTTY) process.stdout.write("\n");
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

/** Resolves with the duration in seconds once Stream has finished encoding. */
async function waitUntilReady(uid: string): Promise<number | null> {
  let lastPct = "";
  for (;;) {
    const video = await streamApi(`/${uid}`);
    if (video.status?.state === "error") {
      throw new StreamEncodeError(`Stream could not encode ${uid}: ${video.status.errorReasonText}`);
    }
    if (video.readyToStream) return video.duration > 0 ? Math.round(video.duration) : null;
    const pct = String(video.status?.pctComplete ?? 0);
    if (pct !== lastPct) console.log(`  encoding ${pct}%`);
    lastPct = pct;
    await sleep(15_000);
  }
}

class StreamEncodeError extends Error {}

/** WebVTT as-is; SubRip is converted (only the header and decimal separator differ). */
function captionAsVtt(path: string): string {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  if (extname(path).toLowerCase() === ".vtt") return text;
  return "WEBVTT\n\n" + text.replace(/\r\n/g, "\n").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
}

export interface UploadJob {
  animeId: number;
  number: number;
  file: string;
  audio: Audio;
  label: string;
  priority: number;
  title?: string;
  captions?: { lang: string; path: string }[];
}

/**
 * Uploads one file to Stream and registers it as a source. Safe to re-run:
 * a source that is already ready is skipped, and one that was uploaded but
 * not finished (the process died while Stream was encoding) is resumed
 * without uploading again. Pending sources are hidden from the site by RLS.
 */
export async function uploadEpisodeFile(db: Db, job: UploadJob): Promise<"uploaded" | "resumed" | "skipped"> {
  const { data: episode, error: epError } = await db
    .from("episodes")
    .upsert(
      { anime_id: job.animeId, number: job.number, ...(job.title ? { title: job.title } : {}) },
      { onConflict: "anime_id,number" },
    )
    .select("id")
    .single();
  if (epError) throw epError;

  const { data: existing, error: findError } = await db
    .from("video_sources")
    .select("id, status, stream_uid")
    .eq("episode_id", episode.id)
    .eq("provider", "cloudflare_stream")
    .eq("audio", job.audio)
    .eq("label", job.label)
    .maybeSingle();
  if (findError) throw findError;

  if (existing?.status === "ready") return "skipped";
  if (existing?.status === "error") {
    throw new Error(`Stream rejected this file before (video_sources id ${existing.id}). Delete that row to retry.`);
  }

  let sourceId: number;
  let uid: string;
  if (existing?.stream_uid) {
    sourceId = existing.id;
    uid = existing.stream_uid;
    console.log(`  resuming Stream video ${uid}`);
  } else {
    uid = await uploadToStream(job.file);
    const { data: source, error } = await db
      .from("video_sources")
      .insert({
        episode_id: episode.id,
        provider: "cloudflare_stream",
        stream_uid: uid,
        label: job.label,
        audio: job.audio,
        priority: job.priority,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(`Uploaded as Stream video ${uid} but could not record it: ${error.message}`);
    sourceId = source.id;
  }

  let duration: number | null;
  try {
    duration = await waitUntilReady(uid);
  } catch (e) {
    if (e instanceof StreamEncodeError) await db.from("video_sources").update({ status: "error" }).eq("id", sourceId);
    throw e;
  }

  // Captions uploaded to Stream are served inside the HLS manifest.
  for (const { lang, path } of job.captions ?? []) {
    const form = new FormData();
    form.append("file", new Blob([captionAsVtt(path)], { type: "text/vtt" }), `${lang}.vtt`);
    await streamApi(`/${uid}/captions/${lang}`, { method: "PUT", body: form });
    console.log(`  added ${lang} captions`);
  }

  const { error: readyError } = await db.from("video_sources").update({ status: "ready" }).eq("id", sourceId);
  if (readyError) throw readyError;
  if (duration) await db.from("episodes").update({ duration_seconds: duration }).eq("id", episode.id);

  return existing ? "resumed" : "uploaded";
}
