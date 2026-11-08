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
}

const TTL = 14 * 86400;
const MAX_NODES = 40;
const BATCH = 8;
const WALK = new Set(["PREQUEL", "SEQUEL", "SIDE_STORY", "SPIN_OFF", "ALTERNATIVE", "PARENT", "SUMMARY", "COMPILATION", "CONTAINS"]);
const MAIN_FORMATS = new Set(["TV", "ONA"]);
const GROUP_OF: Record<string, Group> = { ALTERNATIVE: "alt", SIDE_STORY: "side", SPIN_OFF: "side", PARENT: "side", CONTAINS: "side", SUMMARY: "recap", COMPILATION: "recap" };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;
interface Node { self: FranchiseEntry; anilistId: number; edges: { relation: string; type: string; entry: FranchiseEntry }[] }

/** why the last AniList call failed (read by the debug endpoint) */
export let lastError = "";

const NODE_FIELDS = "id idMal type format title{romaji english} startDate{year month day} seasonYear episodes coverImage{medium}";
const QUERY = `query($m:Int){Media(idMal:$m,type:ANIME){${NODE_FIELDS} relations{edges{relationType node{${NODE_FIELDS}}}}}}`;

const entryOf = (n: Raw, relation: string): FranchiseEntry => {
  const d = n.startDate ?? {};
  const year = d.year ?? n.seasonYear ?? null;
  return {
    malId: Number(n.idMal) || 0,
    title: n.title?.english || n.title?.romaji || "Untitled",
    format: n.format ?? null,
    year,
    date: year ? year * 10000 + (d.month ?? 0) * 100 + (d.day ?? 0) : 0,
    episodes: n.episodes ?? null,
    cover: n.coverImage?.medium ?? null,
    relation,
  };
};

function parse(data: Raw): Node | null {
  const m = data?.data?.Media;
  if (!m?.id) return null;
  return {
    anilistId: m.id,
    self: entryOf(m, ""),
    edges: ((m.relations?.edges ?? []) as Raw[])
      .filter((e) => e?.node?.id)
      .map((e) => ({ relation: String(e.relationType), type: String(e.node.type), entry: entryOf(e.node, String(e.relationType)) })),
  };
}

async function node(malId: number): Promise<Node | null> {
  const key = `anilist:rel2:${malId}`;
  let stale: Node | null = null;
  try {
    const row = await (await db()).prepare("select body, fetched_at from jikan_cache where key = ?").bind(key).first<{ body: string; fetched_at: number }>();
    if (row) {
      stale = JSON.parse(row.body) as Node;
      if (now() - row.fetched_at < TTL) return stale;
    }
  } catch { /* no db (build) */ }
  // AniList rate-limits (90/min) and sometimes answers 429 with a Retry-After: wait it out once
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "user-agent": "cupcake.gg/1.0 (+https://cupcake.gg)" },
        body: JSON.stringify({ query: QUERY, variables: { m: malId } }),
        signal: AbortSignal.timeout(9000),
      });
      if (res.status === 429 && attempt === 0) {
        const wait = Math.min(4000, Number(res.headers.get("retry-after") || 2) * 1000);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) { lastError = `AniList ${res.status}`; return stale; }
      const json = (await res.json()) as Raw;
      const n = parse(json);
      if (!n) { lastError = json?.errors?.[0]?.message || "no such media"; return stale; }
      try {
        await (await db()).prepare("insert into jikan_cache (key, body, fetched_at) values (?, ?, ?) on conflict(key) do update set body = excluded.body, fetched_at = excluded.fetched_at").bind(key, JSON.stringify(n), now()).run();
      } catch { /* best effort */ }
      return n;
    } catch (e) { lastError = `fetch failed: ${(e as Error).message}`; return stale; }
  }
  return stale;
}

export async function getFranchise(malId: number): Promise<Franchise | null> {
  lastError = "";
  const start = await node(malId);
  if (!start) return null;

  // walk every story relation outward from this show, a level at a time
  const found = new Map<number, { entry: FranchiseEntry; group: Group }>([[malId, { entry: start.self, group: "main" }]]);
  let frontier: { node: Node; group: Group }[] = [{ node: start, group: "main" }];
  while (frontier.length && found.size < MAX_NODES) {
    const want: { entry: FranchiseEntry; group: Group }[] = [];
    for (const f of frontier) {
      for (const e of f.node.edges) {
        if (!WALK.has(e.relation) || e.type !== "ANIME" || !e.entry.malId || found.has(e.entry.malId)) continue;
        if (found.size + want.length >= MAX_NODES) break;
        // a prequel/sequel stays on its neighbour's line; anything else starts (or joins) a different one
        const group = e.relation === "PREQUEL" || e.relation === "SEQUEL" ? f.group : GROUP_OF[e.relation] ?? "side";
        const item = { entry: e.entry, group };
        found.set(e.entry.malId, item);
        want.push(item);
      }
    }
    const next: { node: Node; group: Group }[] = [];
    for (let i = 0; i < want.length; i += BATCH) {
      const got = await Promise.all(want.slice(i, i + BATCH).map((w) => node(w.entry.malId)));
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
  return { timeline, seasons, source };
}
