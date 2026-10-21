import { createReadStream, readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import * as tus from "tus-js-client";
import { requireEnv, sleep } from "./lib";
import { d1Query } from "./d1";

export type Audio = "sub" | "dub" | "raw";

const API = "https://api.cloudflare.com/client/v4";

/** Accepts a slug, "anilist:154587" or "anilist-154587". */
export async function resolveAnimeId(ref: string): Promise<number | null> {
  const anilist = ref.match(/^anilist[:-](\d+)$/);
  const rows = anilist
    ? await d1Query<{ id: number }>("SELECT id FROM anime WHERE anilist_id = ?", [Number(anilist[1])])
    : await d1Query<{ id: number }>("SELECT id FROM anime WHERE slug = ?", [ref]);
  return rows[0]?.id ?? null;
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
export async function uploadEpisodeFile(job: UploadJob): Promise<"uploaded" | "resumed" | "skipped"> {
  const episodeRows = await d1Query<{ id: number }>(
    `INSERT INTO episodes (anime_id, number, title) VALUES (?, ?, ?)
     ON CONFLICT (anime_id, number) DO UPDATE SET title = COALESCE(excluded.title, episodes.title)
     RETURNING id`,
    [job.animeId, job.number, job.title ?? null],
  );
  const episodeId = episodeRows[0]?.id;
  if (!episodeId) throw new Error("Could not upsert the episode row");

  const existing = (
    await d1Query<{ id: number; status: string; stream_uid: string | null }>(
      `SELECT id, status, stream_uid FROM video_sources
       WHERE episode_id = ? AND provider = 'cloudflare_stream' AND audio = ? AND label = ?`,
      [episodeId, job.audio, job.label],
    )
  )[0];

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
    const inserted = await d1Query<{ id: number }>(
      `INSERT INTO video_sources (episode_id, provider, stream_uid, label, audio, priority, status)
       VALUES (?, 'cloudflare_stream', ?, ?, ?, ?, 'pending') RETURNING id`,
      [episodeId, uid, job.label, job.audio, job.priority],
    );
    if (!inserted[0]?.id) throw new Error(`Uploaded as Stream video ${uid} but could not record it`);
    sourceId = inserted[0].id;
  }

  let duration: number | null;
  try {
    duration = await waitUntilReady(uid);
  } catch (e) {
    if (e instanceof StreamEncodeError) {
      await d1Query("UPDATE video_sources SET status = 'error' WHERE id = ?", [sourceId]);
    }
    throw e;
  }

  // Captions uploaded to Stream are served inside the HLS manifest.
  for (const { lang, path } of job.captions ?? []) {
    const form = new FormData();
    form.append("file", new Blob([captionAsVtt(path)], { type: "text/vtt" }), `${lang}.vtt`);
    await streamApi(`/${uid}/captions/${lang}`, { method: "PUT", body: form });
    console.log(`  added ${lang} captions`);
  }

  await d1Query("UPDATE video_sources SET status = 'ready' WHERE id = ?", [sourceId]);
  if (duration) await d1Query("UPDATE episodes SET duration_seconds = ? WHERE id = ?", [duration, episodeId]);

  return existing ? "resumed" : "uploaded";
}
