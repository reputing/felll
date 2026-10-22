// Fills D1 with the MyAnimeList catalog, from outside Cloudflare.
//
// Jikan refuses or throttles requests from Cloudflare's shared Worker IPs, so
// the site can't rely on calling it live. This runs anywhere else (your PC, a
// GitHub Action), fetches the lists and shows the site needs, and writes them
// into D1 with wrangler, using the account you're logged into:
//
//   npm run sync                 # the usual: ~8 min, respects Jikan's 60/min limit
//   npm run sync -- --quick      # ~3 min: lists, 500 titles, airing shows only
//   npm run sync -- --local      # into the local dev database instead
//   npm run sync -- --pages 120 --details 100
//
// It writes two things:
//   * jikan_cache rows under the exact keys the Worker asks for (lib/jikan-paths.ts),
//     so pages read them as if Jikan had answered, and
//   * catalog rows, which search, seasons, schedule and show pages fall back to.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { arg, flag, sleep } from "./lib";
import {
  catalogColumns, currentSeason, isAdult, PATHS, SEASONS, TOP_LISTS, trimAnime, WEEKDAYS,
  type SeasonName, type TopList,
} from "../lib/jikan-paths";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

const JIKAN = (process.env.JIKAN_URL || "https://api.jikan.moe/v4").replace(/\/+$/, "");
const DB_NAME = arg("db") ?? "felll";
const LOCAL = flag("local");
const QUICK = flag("quick");
const PAGES = Number(arg("pages")) || (QUICK ? 20 : 60);
const DETAILS = Number(arg("details") ?? (QUICK ? 0 : 50));
// Jikan allows 3 a second but only 60 a minute; stay just under.
const SPACING_MS = Number(process.env.SYNC_SPACING_MS) || 1050;

let requests = 0;
let last = 0;

async function get(path: string): Promise<Raw | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = last + SPACING_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    requests++;
    const res = await fetch(JIKAN + path, { headers: { accept: "application/json", "user-agent": "cupcake.gg sync (+https://github.com/reputing/felll)" } }).catch(() => null);
    if (res?.ok) return res.json();
    if (res?.status === 404) return null;
    const backoff = res?.status === 429 ? 4000 : 2000 * (attempt + 1);
    console.warn(`  ${res?.status ?? "network error"} on ${path}, retrying in ${backoff / 1000}s`);
    await sleep(backoff);
  }
  console.warn(`  gave up on ${path}`);
  return null;
}

// ---- SQL ------------------------------------------------------------------

const lit = (v: unknown) =>
  v == null ? "null" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "null") : `'${String(v).replace(/'/g, "''")}'`;

// D1 refuses statements over 100 KB.
const MAX_STATEMENT = 95_000;
let pending: string[] = [];

function cache(key: string, body: Raw) {
  const stmt = `insert into jikan_cache (key, body, fetched_at) values (${lit(key)}, ${lit(JSON.stringify(body))}, unixepoch()) on conflict(key) do update set body = excluded.body, fetched_at = excluded.fetched_at;`;
  if (stmt.length > MAX_STATEMENT) return console.warn(`  skipped caching ${key}: too big`);
  pending.push(stmt);
}

const seen = new Set<number>();
function catalog(m: Raw) {
  if (!m?.mal_id || isAdult(m)) return;
  const c = catalogColumns(m);
  const body = JSON.stringify(trimAnime(m, 4000));
  const cols = ["mal_id", "search", "members", "favorites", "score", "year", "season", "kind", "status", "airing", "broadcast_day", "genres", "start_date", "body"];
  const vals = [c.mal_id, c.search, c.members, c.favorites, c.score, c.year, c.season, c.kind, c.status, c.airing, c.broadcast_day, c.genres, c.start_date, body];
  // a full record (with relations) beats a list entry for the same show
  const keepRicher = m.relations ? "" : " where catalog.body not like '%\"relations\"%'";
  pending.push(
    `insert into catalog (${cols.join(", ")}, updated_at) values (${vals.map(lit).join(", ")}, unixepoch())
     on conflict(mal_id) do update set ${cols.slice(1).map((k) => `${k} = excluded.${k}`).join(", ")}, updated_at = unixepoch()${keepRicher};`,
  );
  seen.add(c.mal_id);
}

/** A list response: cache it (synopses shortened) and catalog every entry. */
function list(key: string, data: Raw) {
  if (!data?.data) return [];
  const items = (data.data as Raw[]).filter((m) => m && !isAdult(m));
  items.forEach(catalog);
  for (const max of [400, 120]) {
    const body = { data: items.map((m) => trimAnime(m, max)), pagination: data.pagination ?? null };
    if (JSON.stringify(body).length < MAX_STATEMENT - 500) { cache(key, body); break; }
  }
  return items;
}

const dir = mkdtempSync(join(tmpdir(), "cupcake-sync-"));
let flushes = 0;

/** Send what's pending to D1, in files wrangler can import. */
function flush(label: string) {
  if (!pending.length) return;
  const chunks: string[][] = [[]];
  let size = 0;
  for (const s of pending) {
    if (size + s.length > 4_000_000) { chunks.push([]); size = 0; }
    chunks[chunks.length - 1].push(s);
    size += s.length;
  }
  for (const chunk of chunks) {
    const file = join(dir, `sync-${++flushes}.sql`);
    writeFileSync(file, chunk.join("\n"));
    // on Windows npx is a .cmd, which needs a shell, and the shell needs the path quoted
    const win = process.platform === "win32";
    const args = ["wrangler", "d1", "execute", DB_NAME, LOCAL ? "--local" : "--remote", "--yes", win ? `--file="${file}"` : `--file=${file}`];
    try {
      execFileSync("npx", args, { stdio: ["ignore", "pipe", "pipe"], shell: win });
    } catch (e) {
      const err = e as { stderr?: Buffer; stdout?: Buffer };
      console.error((err.stderr?.toString() || err.stdout?.toString() || String(e)).slice(-1500));
      throw new Error(`Writing ${label} to D1 failed (above). Are you logged in? Try: npx wrangler login`);
    }
  }
  console.log(`  ✓ saved ${label} (${pending.length} rows)`);
  pending = [];
}

// ---- what to fetch ----------------------------------------------------------

function shift(year: number, season: SeasonName, by: number) {
  const i = SEASONS.indexOf(season) + by;
  return { year: year + Math.floor(i / 4), season: SEASONS[((i % 4) + 4) % 4] };
}

async function wholeSeason(year: number, season: SeasonName, max: number) {
  const ids: Raw[] = [];
  for (let p = 1; p <= max; p++) {
    const data = await get(PATHS.season(year, season, p));
    ids.push(...list(PATHS.season(year, season, p), data));
    if (!data?.pagination?.has_next_page) break;
  }
  return ids;
}

async function details(m: Raw, deep: boolean) {
  const id = m.mal_id as number;
  const f = await get(PATHS.full(id));
  if (f?.data && !isAdult(f.data)) {
    cache(PATHS.full(id), { data: trimAnime(f.data) });
    catalog(f.data);
  }
  const eps = await get(PATHS.episodes(id));
  if (eps) {
    cache(PATHS.episodes(id), {
      data: (eps.data ?? []).map((e: Raw) => ({ mal_id: e.mal_id, title: e.title, title_romanji: e.title_romanji, aired: e.aired, score: e.score, filler: e.filler, recap: e.recap })),
      pagination: eps.pagination ?? null,
    });
  }
  if (!deep) return;
  const ch = await get(PATHS.characters(id));
  if (ch) {
    cache(PATHS.characters(id), {
      data: (ch.data ?? [])
        .sort((a: Raw, b: Raw) => (a.role === b.role ? (b.favorites ?? 0) - (a.favorites ?? 0) : a.role === "Main" ? -1 : 1))
        .slice(0, 18)
        .map((c: Raw) => ({
          role: c.role, favorites: c.favorites,
          character: { mal_id: c.character.mal_id, name: c.character.name, images: { webp: { image_url: c.character.images?.webp?.image_url ?? null }, jpg: { image_url: c.character.images?.jpg?.image_url ?? null } } },
          voice_actors: (c.voice_actors ?? []).filter((v: Raw) => v.language === "Japanese").slice(0, 1)
            .map((v: Raw) => ({ language: v.language, person: { mal_id: v.person.mal_id, name: v.person.name, images: { jpg: { image_url: v.person.images?.jpg?.image_url ?? null } } } })),
        })),
    });
  }
  const recs = await get(PATHS.recommendations(id));
  if (recs) {
    cache(PATHS.recommendations(id), {
      data: (recs.data ?? []).slice(0, 12).map((r: Raw) => ({
        votes: r.votes,
        entry: { mal_id: r.entry.mal_id, title: r.entry.title, images: { webp: { large_image_url: r.entry.images?.webp?.large_image_url ?? null }, jpg: { large_image_url: r.entry.images?.jpg?.large_image_url ?? null } } },
      })),
    });
  }
}

async function main() {
  const started = Date.now();
  console.log(`Syncing MyAnimeList into D1 "${DB_NAME}" (${LOCAL ? "local" : "remote"})${QUICK ? ", quick" : ""}.`);

  console.log("Home lists, genres, schedule…");
  const airing = new Map<number, Raw>();
  for (const key of [PATHS.homeAiring, PATHS.homeSeason, PATHS.homeTop, PATHS.homePopular, PATHS.homeUpcoming]) {
    for (const m of list(key, await get(key))) if (m.airing) airing.set(m.mal_id, m);
  }
  const genres = await get(PATHS.genres);
  if (genres) cache(PATHS.genres, { data: (genres.data ?? []).map((g: Raw) => ({ mal_id: g.mal_id, name: g.name, count: g.count })) });
  for (const day of WEEKDAYS) for (const m of list(PATHS.schedule(day), await get(PATHS.schedule(day)))) airing.set(m.mal_id, m);
  flush("home lists and schedule");

  console.log("Seasons…");
  const cur = currentSeason();
  for (const m of await wholeSeason(cur.year, cur.season, 6)) if (m.airing) airing.set(m.mal_id, m);
  const next = shift(cur.year, cur.season, 1);
  await wholeSeason(next.year, next.season, QUICK ? 1 : 4);
  if (!QUICK) {
    const prev = shift(cur.year, cur.season, -1);
    await wholeSeason(prev.year, prev.season, 4);
  }
  for (let p = 1; p <= (QUICK ? 1 : 4); p++) {
    const data = await get(PATHS.upcoming(p));
    list(PATHS.upcoming(p), data);
    if (!data?.pagination?.has_next_page) break;
  }
  flush("seasons");

  console.log("Rankings…");
  for (const l of Object.keys(TOP_LISTS) as TopList[]) {
    for (let p = 1; p <= (QUICK ? 1 : 2); p++) list(PATHS.top(l, p), await get(PATHS.top(l, p)));
  }
  flush("rankings");

  console.log(`Catalog: the ${PAGES * 25} most popular titles…`);
  const popular: Raw[] = [];
  for (let p = 1; p <= PAGES; p++) {
    const data = await get(`/anime?sfw=true&order_by=members&sort=desc&limit=25&page=${p}`);
    if (!data?.data?.length) break;
    for (const m of data.data) if (!isAdult(m)) { catalog(m); popular.push(m); }
    if (p % 10 === 0) { flush(`catalog pages ${p - 9}-${p}`); }
  }
  flush("catalog");

  const airingList = [...airing.values()].sort((a, b) => (b.members ?? 0) - (a.members ?? 0));
  const deepIds = new Set(popular.slice(0, DETAILS).map((m) => m.mal_id));
  const targets = [...airingList, ...popular.slice(0, DETAILS).filter((m) => !airing.has(m.mal_id))];
  console.log(`Show pages: ${targets.length} (episodes for every airing show, cast and recommendations for the top ${DETAILS})…`);
  for (const [i, m] of targets.entries()) {
    await details(m, deepIds.has(m.mal_id) || (!QUICK && i < 40));
    if ((i + 1) % 25 === 0) flush(`show pages ${i - 23}-${i + 1}`);
  }
  flush("show pages");

  rmSync(dir, { recursive: true, force: true });
  console.log(`Done in ${Math.round((Date.now() - started) / 60000)} min: ${seen.size} titles, ${requests} Jikan requests.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
