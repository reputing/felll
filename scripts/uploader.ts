import { createReadStream, readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import * as tus from "tus-js-client";
import { d1, requireEnv, sleep } from "./lib";

export type Audio = "sub" | "dub" | "raw";

const API = "https://api.cloudflare.com/client/v4";
// one token can carry both "Stream: Edit" and "D1: Edit"
const streamToken = () => process.env.CLOUDFLARE_STREAM_API_TOKEN || requireEnv("CLOUDFLARE_API_TOKEN");

function uploadToStream(file: string): Promise<string> {
  const size = statSync(file).size;
  let uid: string | null = null;
  let lastLogged = -10;

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(createReadStream(file), {
      endpoint: `${API}/accounts/${requireEnv("CLOUDFLARE_ACCOUNT_ID")}/stream`,
      headers: { Authorization: `Bearer ${streamToken()}` },
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
    headers: { Authorization: `Bearer ${streamToken()}`, ...init.headers },
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
  malId: number;
  number: number;
  file: string;
  audio: Audio;
  label: string;
  priority: number;
  title?: string;
  captions?: { lang: string; path: string }[];
}

/** The episode row for (anime, number), created if needed; returns its id. */
export async function episodeId(malId: number, number: number, title?: string): Promise<number> {
  const [row] = await d1<{ id: number }>(
    `insert into episodes (mal_id, number, title) values (?, ?, ?)
     on conflict(mal_id, number) do update set title = coalesce(excluded.title, episodes.title)
     returning id`,
    malId, number, title ?? null,
  );
  return row.id;
}

/**
 * Uploads one file to Stream and registers it as a source. Safe to re-run:
 * a source that is already ready is skipped, and one that was uploaded but
 * not finished (the process died while Stream was encoding) is resumed
 * without uploading again. Pending sources are never shown on the site.
 */
export async function uploadEpisodeFile(job: UploadJob): Promise<"uploaded" | "resumed" | "skipped"> {
  const epId = await episodeId(job.malId, job.number, job.title);
  const [existing] = await d1<{ id: number; status: string; stream_uid: string | null }>(
    `select id, status, stream_uid from video_sources
     where episode_id = ? and provider = 'cloudflare_stream' and audio = ? and label = ?`,
    epId, job.audio, job.label,
  );

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
    try {
      const [row] = await d1<{ id: number }>(
        `insert into video_sources (episode_id, provider, stream_uid, label, audio, priority, status)
         values (?, 'cloudflare_stream', ?, ?, ?, ?, 'pending') returning id`,
        epId, uid, job.label, job.audio, job.priority,
      );
      sourceId = row.id;
    } catch (e) {
      throw new Error(`Uploaded as Stream video ${uid} but could not record it: ${e instanceof Error ? e.message : e}`);
    }
  }

  let duration: number | null;
  try {
    duration = await waitUntilReady(uid);
  } catch (e) {
    if (e instanceof StreamEncodeError) await d1("update video_sources set status = 'error' where id = ?", sourceId);
    throw e;
  }

  // Captions uploaded to Stream are served inside the HLS manifest.
  for (const { lang, path } of job.captions ?? []) {
    const form = new FormData();
    form.append("file", new Blob([captionAsVtt(path)], { type: "text/vtt" }), `${lang}.vtt`);
    await streamApi(`/${uid}/captions/${lang}`, { method: "PUT", body: form });
    console.log(`  added ${lang} captions`);
  }

  await d1("update video_sources set status = 'ready' where id = ?", sourceId);
  if (duration) await d1("update episodes set duration_seconds = ? where id = ?", duration, epId);
  await notifyRequesters(job.malId);

  return existing ? "resumed" : "uploaded";
}

/** First episode of a requested show is live: mark the request filled and ping everyone who asked. */
async function notifyRequesters(malId: number) {
  const [req] = await d1<{ title: string }>("select title from requests where mal_id = ? and status = 'open'", malId);
  if (!req) return;
  await d1(
    `insert into notifications (user_id, kind, mal_id, text)
     select user_id, 'request_filled', mal_id, ? from request_votes where mal_id = ?`,
    `${req.title} just landed in the vault. Go watch!`, malId,
  );
  await d1("update requests set status = 'filled' where mal_id = ?", malId);
  console.log(`  told everyone who requested ${req.title}`);
}
