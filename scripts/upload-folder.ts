// Uploads every episode in a folder, or keeps watching it and uploads new
// files as they appear.
//
//   npm run upload:folder -- --dir ./uploads            # once
//   npm run upload:watch  -- --dir ./uploads            # keep running
//
// Layout: one folder per anime, named by its slug (from the site URL) or
// "anilist-<id>". File names give the episode number, an optional title and
// an optional audio track; captions sit next to the video they belong to.
//
//   uploads/
//     frieren-beyond-journey-s-end-16w8tc/
//       01.mkv                       episode 1, sub
//       01.en.vtt                    English captions for 01.mkv
//       02 - Aura the Guillotine.mkv episode 2, sub, with a title
//       02.dub.mkv                   episode 2, dub
//       12.5.mkv                     episode 12.5 (recap/special)
//     anilist-154587/
//       ...
//
// Files already live on the site are skipped, so the folder can keep its
// files. An upload interrupted while Stream was encoding resumes without
// uploading again.

import { readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { arg, flag, sleep } from "./lib";
import { d1Query } from "./d1";
import { resolveAnimeId, uploadEpisodeFile, type Audio } from "./uploader";

const VIDEO_EXT = new Set([".mkv", ".mp4", ".m4v", ".mov", ".webm", ".avi", ".ts", ".mpg"]);
const CAPTION_EXT = new Set([".vtt", ".srt"]);
const MAX_FAILURES = 3;

const dir = arg("dir");
const watch = flag("watch");
const intervalMs = (Number(arg("interval")) || 60) * 1000;
const label = arg("label") ?? "Main";

interface Parsed {
  number: number;
  title?: string;
  audio: Audio;
}

/** "02 - Aura the Guillotine.dub.mkv" → episode 2, dub, titled. */
function parseVideoName(file: string): Parsed | null {
  let stem = basename(file, extname(file));
  let audio: Audio = "sub";
  const track = stem.match(/\.(sub|dub|raw)$/i);
  if (track) {
    audio = track[1].toLowerCase() as Audio;
    stem = stem.slice(0, -track[0].length);
  }
  const m = stem.match(/^(?:ep(?:isode)?[\s._-]*)?(\d{1,4}(?:\.\d)?)(?:\s+-\s+(.+))?$/i);
  if (!m) return null;
  return { number: Number(m[1]), title: m[2]?.trim(), audio };
}

/** Captions for "01.dub.mkv" are "01.dub.<lang>.vtt" (or .srt). */
function captionsFor(video: string, siblings: string[]): { lang: string; path: string }[] {
  const stem = basename(video, extname(video));
  return siblings.flatMap((name) => {
    const ext = extname(name).toLowerCase();
    if (!CAPTION_EXT.has(ext) || !name.startsWith(stem + ".")) return [];
    const lang = name.slice(stem.length + 1, -ext.length);
    return /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(lang) ? [{ lang, path: join(video, "..", name) }] : [];
  });
}

const seen = new Map<string, string>();
const failures = new Map<string, number>();
const warned = new Set<string>();

function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/** In watch mode, a file counts as complete once its size and mtime hold still across two scans. */
function settled(path: string): boolean {
  if (!watch) return true;
  const s = statSync(path);
  const fingerprint = `${s.size}:${s.mtimeMs}`;
  const previous = seen.get(path);
  seen.set(path, fingerprint);
  return previous === fingerprint && Date.now() - s.mtimeMs > 15_000;
}

async function scan() {
  let uploaded = 0;
  for (const folder of readdirSync(dir!, { withFileTypes: true })) {
    if (!folder.isDirectory() || folder.name.startsWith(".")) continue;
    const animeId = await resolveAnimeId(folder.name);
    if (!animeId) {
      warnOnce(folder.name, `Skipping ${folder.name}/: no anime with that slug or AniList id. Run the catalog sync, or rename the folder.`);
      continue;
    }

    const live = await d1Query<{ number: number; audio: string; label: string }>(
      `SELECT e.number AS number, s.audio AS audio, s.label AS label
       FROM episodes e JOIN video_sources s ON s.episode_id = e.id
       WHERE e.anime_id = ? AND s.status = 'ready'`,
      [animeId],
    );
    const done = new Set(live.map((r) => `${Number(r.number)}|${r.audio}|${r.label}`));

    const folderPath = join(dir!, folder.name);
    const names = readdirSync(folderPath).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const name of names) {
      if (!VIDEO_EXT.has(extname(name).toLowerCase())) continue;
      const path = join(folderPath, name);
      const parsed = parseVideoName(name);
      if (!parsed) {
        warnOnce(path, `Skipping ${folder.name}/${name}: name must start with the episode number, e.g. "01.mkv" or "01 - Title.dub.mkv".`);
        continue;
      }
      if (done.has(`${parsed.number}|${parsed.audio}|${label}`)) continue;
      if ((failures.get(path) ?? 0) >= MAX_FAILURES || !settled(path)) continue;

      console.log(`${folder.name} episode ${parsed.number} (${parsed.audio}): ${name}`);
      try {
        const result = await uploadEpisodeFile({
          animeId,
          number: parsed.number,
          file: path,
          audio: parsed.audio,
          label,
          priority: parsed.audio === "sub" ? 0 : 1,
          title: parsed.title,
          captions: captionsFor(path, names),
        });
        if (result !== "skipped") {
          uploaded++;
          console.log(`  live`);
        }
      } catch (e) {
        const count = (failures.get(path) ?? 0) + 1;
        failures.set(path, count);
        console.error(`  failed (${count}/${MAX_FAILURES}): ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  return uploaded;
}

async function main() {
  if (!dir) throw new Error("Usage: --dir <folder> [--watch] [--interval 60] [--label Main]");
  if (!watch) {
    const n = await scan();
    console.log(n ? `Done: ${n} episode(s) uploaded.` : "Nothing new to upload.");
    return;
  }
  console.log(`Watching ${dir} every ${intervalMs / 1000}s. Drop files in and they go live automatically.`);
  for (;;) {
    try {
      await scan();
    } catch (e) {
      console.error(`Scan failed, retrying next round: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(intervalMs);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
