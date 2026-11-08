// A show's whole franchise as one story map: every season, movie, special, alternate version,
// side story and spin-off connected to it, in release order, each labelled by how it relates
// (main line / alternate version / side story / recap), plus the manga or novel it was adapted
// from. The catalog is MAL-keyed and has no relations of its own, so this comes from AniList (which
// takes a MAL id directly) and is cached in D1 per show, shared by everyone.
//
// The graph is walked through every story relation, not only prequel/sequel: Fate, Monogatari and
// the like connect their entries as alternates, side stories and spin-offs. The walk is capped, a
// level at a time, so a sprawling franchise can't turn one page view into dozens of upstream calls
// (and each show it touches is cached for two weeks).
import { db, now } from "./db";

export type Group = "main" | "alt" | "side" | "recap";

export interface FranchiseEntry {
  malId: number;
  title: string;
  format: string | null;   // TV, MOVIE, OVA, SPECIAL, ONA, TV_SHORT ...
  year: number | null;
  date: number;            // yyyymmdd for ordering (0 = unknown, sorts last)
  episodes: number | null;
  cover: string | null;
  relation: string;        // how this was reached ("" for the show itself)
}
export interface TimelineEntry extends FranchiseEntry { group: Group; current: boolean }
export interface FranchiseSource { title: string; format: string; malId: number | null; kind: "manga" | "novel" }
export interface Franchise {
  timeline: TimelineEntry[];                       // everything, in release order
  seasons: (FranchiseEntry & { current: boolean })[]; // the main line's TV/ONA entries
  source: FranchiseSource | null;
  /** the call budget ran out before every show was reached; asking again carries on (cached shows are free) */
  partial?: boolean;
}

const TTL = 14 * 86400;
const MAX_NODES = 30; // each show costs 2-4 Kitsu calls the first time, then it is cached
const BATCH = 5;
const WALK = new Set(["PREQUEL", "SEQUEL", "SIDE_STORY", "SPIN_OFF", "ALTERNATIVE", "PARENT", "SUMMARY", "COMPILATION", "CONTAINS"]);
const MAIN_FORMATS = new Set(["TV", "ONA"]);
const GROUP_OF: Record<string, Group> = { ALTERNATIVE: "alt", SIDE_STORY: "side", SPIN_OFF: "side", PARENT: "side", CONTAINS: "side", SUMMARY: "recap", COMPILATION: "recap" };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;
interface Edge { relation: string; type: string; entry: FranchiseEntry; kid: string }
interface Node { self: FranchiseEntry; kid: string; edges: Edge[] }

/** why the last upstream call failed (read by the debug endpoint) */
export let lastError = "";

// A Worker request may only make so many outgoing calls, and a big franchise needs a few per show the
// first time. Each page view spends at most this many; whatever is not reached stays uncached and is
// picked up on the next view (every show it does reach is cached for two weeks).
let budget = 0;
const BUDGET = 40;
const spend = () => (budget > 0 ? (budget--, true) : false);

// Kitsu, not AniList: AniList blocks this site's hosting network outright (HTTP 403 "manually
// blocked" for every request), while Kitsu answers. Kitsu knows MAL ids through its "mappings", and
// its media relationships carry the same roles (sequel, side story, alternative version, ...).
const KITSU = "https://kitsu.io/api/edge";
const ANIME_FIELDS = "canonicalTitle,titles,subtype,startDate,episodeCount,posterImage";

async function kget(path: string): Promise<Raw | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!spend()) { lastError = "call budget used"; return null; }
    try {
      const res = await fetch(path.startsWith("http") ? path : KITSU + path, { headers: { accept: "application/vnd.api+json", "user-agent": "cupcake.gg/1.0 (+https://cupcake.gg)" }, signal: AbortSignal.timeout(9000) });
      if (res.status === 429 && attempt === 0) { await new Promise((r) => setTimeout(r, Math.min(3000, Number(res.headers.get("retry-after") || 1.5) * 1000))); continue; }
      if (!res.ok) { lastError = `Kitsu ${res.status}`; return null; }
      return await res.json();
    } catch (e) { lastError = `fetch failed: ${(e as Error).message}`; return null; }
  }
  return null;
}

const FORMAT: Record<string, string> = { tv: "TV", movie: "MOVIE", ova: "OVA", ona: "ONA", special: "SPECIAL", music: "MUSIC", novel: "NOVEL", manga: "MANGA", oneshot: "ONE_SHOT", doujin: "MANGA", manhwa: "MANGA", manhua: "MANGA", oel: "MANGA" };
const ROLE: Record<string, string> = { sequel: "SEQUEL", prequel: "PREQUEL", side_story: "SIDE_STORY", spinoff: "SPIN_OFF", parent_story: "PARENT", alternative_version: "ALTERNATIVE", alternative_setting: "ALTERNATIVE", summary: "SUMMARY", adaptation: "ADAPTATION", character: "CHARACTER", other: "OTHER", full_story: "FULL_STORY" };

function entryOf(a: Raw, malId: number, relation: string): FranchiseEntry {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(a?.startDate ?? "");
  const year = d ? Number(d[1]) : null;
  const t = a?.titles ?? {};
  return {
    malId,
    title: a?.canonicalTitle || t.en || t.en_jp || "Untitled",
    format: FORMAT[String(a?.subtype ?? "").toLowerCase()] ?? (a?.subtype ? String(a.subtype).toUpperCase() : null),
    year,
    date: d ? Number(d[1]) * 10000 + Number(d[2]) * 100 + Number(d[3]) : 0,
    episodes: a?.episodeCount ?? null,
    cover: a?.posterImage?.tiny ?? a?.posterImage?.small ?? null,
    relation,
  };
}

/** MAL ids for a batch of Kitsu anime ids, from ARM (arm.haglund.dev), which maps ids between the
 *  anime sites and answers a whole batch in one call (Kitsu's own mappings can't be filtered by item). */
async function malIdsOf(kids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < kids.length; i += 40) {
    const chunk = kids.slice(i, i + 40);
    if (!spend()) { lastError = "call budget used"; break; }
    try {
      const res = await fetch("https://arm.haglund.dev/api/v2/ids", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(chunk.map((k) => ({ kitsu: Number(k) }))), signal: AbortSignal.timeout(9000) });
      if (!res.ok) { lastError = `ARM ${res.status}`; continue; }
      const rows = (await res.json()) as { myanimelist?: number | null }[];
      rows.forEach((r, j) => { if (r?.myanimelist) out.set(chunk[j], Number(r.myanimelist)); });
    } catch (e) { lastError = `ARM failed: ${(e as Error).message}`; }
  }
  return out;
}

/** a MAL id's Kitsu id, from ARM */
async function kitsuIdOf(malId: number): Promise<string> {
  if (!spend()) { lastError = "call budget used"; return ""; }
  try {
    const res = await fetch(`https://arm.haglund.dev/api/v2/ids?source=myanimelist&id=${malId}`, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) { lastError = `ARM ${res.status}`; return ""; }
    const k = ((await res.json()) as { kitsu?: number | null })?.kitsu;
    if (!k) lastError = "not on Kitsu";
    return k ? String(k) : "";
  } catch (e) { lastError = `ARM failed: ${(e as Error).message}`; return ""; }
}

async function node(malId: number, knownKid?: string): Promise<Node | null> {
  const key = `kitsu:rel:${malId}`;
  let stale: Node | null = null;
  try {
    const row = await (await db()).prepare("select body, fetched_at from jikan_cache where key = ?").bind(key).first<{ body: string; fetched_at: number }>();
    if (row) {
      stale = JSON.parse(row.body) as Node;
      if (now() - row.fetched_at < TTL) return stale;
    }
  } catch { /* no db (build) */ }

  // this show on Kitsu
  let kid = knownKid ?? stale?.kid ?? "";
  let self: FranchiseEntry | null = stale?.self ?? null;
  if (!kid) { kid = await kitsuIdOf(malId); if (!kid) return stale; }
  if (!self) {
    const d = await kget(`/anime/${kid}?fields[anime]=${ANIME_FIELDS}`);
    if (!d?.data) return stale;
    self = entryOf(d.data.attributes, malId, "");
  }

  // its relationships (a few pages at most), then the MAL ids of the anime among them
  const rels: { role: string; dest: Raw }[] = [];
  let url: string | null = `/anime/${kid}/media-relationships?include=destination&page[limit]=20&fields[anime]=${ANIME_FIELDS}&fields[manga]=canonicalTitle,titles,subtype,startDate`;
  for (let page = 0; url && page < 3; page++) {
    const d = await kget(url);
    if (!d) { if (page === 0) return stale; break; }
    const inc = new Map<string, Raw>((d.included ?? []).map((x: Raw) => [`${x.type}:${x.id}`, x]));
    for (const r of d.data ?? []) {
      const dst = r.relationships?.destination?.data;
      const it = dst ? inc.get(`${dst.type}:${dst.id}`) : null;
      if (it) rels.push({ role: String(r.attributes?.role ?? ""), dest: it });
    }
    url = d.links?.next ?? null;
  }
  const mal = await malIdsOf(rels.filter((r) => r.dest.type === "anime").map((r) => String(r.dest.id)));
  const edges: Edge[] = rels.flatMap(({ role, dest }) => {
    const relation = ROLE[role];
    if (!relation) return [];
    const isAnime = dest.type === "anime";
    const m = isAnime ? mal.get(String(dest.id)) ?? 0 : 0;
    return [{ relation, type: isAnime ? "ANIME" : "MANGA", kid: String(dest.id), entry: entryOf(dest.attributes, m, relation) }];
  });
  const n: Node = { self, kid, edges };
  try {
    await (await db()).prepare("insert into jikan_cache (key, body, fetched_at) values (?, ?, ?) on conflict(key) do update set body = excluded.body, fetched_at = excluded.fetched_at").bind(key, JSON.stringify(n), now()).run();
  } catch { /* best effort */ }
  return n;
}

export async function getFranchise(malId: number): Promise<Franchise | null> {
  lastError = "";
  budget = BUDGET;
  const start = await node(malId);
  if (!start) return null;

  // walk every story relation outward from this show, a level at a time
  const found = new Map<number, { entry: FranchiseEntry; group: Group; kid?: string }>([[malId, { entry: start.self, group: "main", kid: start.kid }]]);
  let frontier: { node: Node; group: Group }[] = [{ node: start, group: "main" }];
  while (frontier.length && found.size < MAX_NODES) {
    const want: { entry: FranchiseEntry; group: Group; kid?: string }[] = [];
    for (const f of frontier) {
      for (const e of f.node.edges) {
        if (!WALK.has(e.relation) || e.type !== "ANIME" || !e.entry.malId || found.has(e.entry.malId)) continue;
        if (found.size + want.length >= MAX_NODES) break;
        // a prequel/sequel stays on its neighbour's line; anything else starts (or joins) a different one
        const group = e.relation === "PREQUEL" || e.relation === "SEQUEL" ? f.group : GROUP_OF[e.relation] ?? "side";
        const item = { entry: e.entry, group, kid: e.kid };
        found.set(e.entry.malId, item);
        want.push(item);
      }
    }
    const next: { node: Node; group: Group }[] = [];
    for (let i = 0; i < want.length; i += BATCH) {
      const got = await Promise.all(want.slice(i, i + BATCH).map((w) => node(w.entry.malId, w.kid)));
      got.forEach((g, j) => { if (g) next.push({ node: g, group: want[i + j].group }); });
    }
    frontier = next;
  }

  const timeline: TimelineEntry[] = [...found.values()]
    .map(({ entry, group }) => ({ ...entry, group, current: entry.malId === malId }))
    .sort((a, b) => (a.date || 99999999) - (b.date || 99999999) || a.malId - b.malId);
  const seasons = timeline.filter((e) => e.group === "main" && (MAIN_FORMATS.has(e.format ?? "") || e.current)).map(({ group: _g, ...e }) => e);

  let source: FranchiseSource | null = null;
  for (const e of start.edges) {
    if (e.relation === "ADAPTATION" && e.type === "MANGA") {
      const isNovel = /NOVEL/.test(e.entry.format ?? "");
      // a manga beats a light novel when both are listed
      if (!source || (source.kind === "novel" && !isNovel)) source = { title: e.entry.title, format: e.entry.format ?? "MANGA", malId: e.entry.malId || null, kind: isNovel ? "novel" : "manga" };
    }
  }
  if (timeline.length < 2 && !source) return null;
  return { timeline, seasons, source, partial: budget <= 0 };
}
