// A show's franchise: its seasons in order (S1, S2, S3 ...), the movies and specials that sit
// between them, and its side stories / spin-offs, plus the manga or novel it was adapted from.
// The catalog is MAL-keyed and has no relations of its own, so this comes from AniList (which
// takes a MAL id directly) and is cached in D1 per show, shared by everyone.
//
// A franchise is walked through PREQUEL/SEQUEL links only (that is what a "season" is); every
// other relation is read from the show you're looking at. Walking is capped so a sprawling
// franchise can't turn one page view into dozens of upstream calls.
import { db, now } from "./db";

export interface FranchiseEntry {
  malId: number;
  title: string;
  format: string | null;   // TV, MOVIE, OVA, SPECIAL, ONA, TV_SHORT ...
  year: number | null;
  episodes: number | null;
  cover: string | null;
  relation: string;        // PREQUEL, SIDE_STORY ... ("" for the show itself)
}
export interface FranchiseSource { title: string; format: string; malId: number | null; kind: "manga" | "novel" }
export interface Franchise {
  seasons: (FranchiseEntry & { current: boolean })[];
  extras: FranchiseEntry[];     // movies, OVAs, specials, shorts in the same chain
  related: FranchiseEntry[];    // side stories, spin-offs, alternatives ...
  source: FranchiseSource | null;
}

const TTL = 14 * 86400;
const CHAIN = new Set(["PREQUEL", "SEQUEL"]);
const MAIN_FORMATS = new Set(["TV", "ONA"]);
const MAX_NODES = 14;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;
interface Node { self: FranchiseEntry; anilistId: number; edges: { relation: string; anilistId: number; type: string; entry: FranchiseEntry }[] }

const QUERY = `query($m:Int){Media(idMal:$m,type:ANIME){id idMal title{romaji english} format seasonYear episodes coverImage{medium}
  relations{edges{relationType node{id idMal type format title{romaji english} seasonYear episodes coverImage{medium}}}}}}`;

const entryOf = (n: Raw, relation: string): FranchiseEntry => ({
  malId: Number(n.idMal) || 0,
  title: n.title?.english || n.title?.romaji || "Untitled",
  format: n.format ?? null,
  year: n.seasonYear ?? null,
  episodes: n.episodes ?? null,
  cover: n.coverImage?.medium ?? null,
  relation,
});

function parse(data: Raw): Node | null {
  const m = data?.data?.Media;
  if (!m?.id) return null;
  return {
    anilistId: m.id,
    self: entryOf(m, ""),
    edges: ((m.relations?.edges ?? []) as Raw[])
      .filter((e) => e?.node?.id)
      .map((e) => ({ relation: String(e.relationType), anilistId: e.node.id as number, type: String(e.node.type), entry: entryOf(e.node, String(e.relationType)) })),
  };
}

async function node(malId: number): Promise<Node | null> {
  const key = `anilist:rel:${malId}`;
  let stale: Node | null = null;
  try {
    const row = await (await db()).prepare("select body, fetched_at from jikan_cache where key = ?").bind(key).first<{ body: string; fetched_at: number }>();
    if (row) {
      stale = JSON.parse(row.body) as Node;
      if (now() - row.fetched_at < TTL) return stale;
    }
  } catch { /* no db (build) */ }
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { m: malId } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return stale;
    const n = parse(await res.json());
    if (!n) return stale;
    try {
      await (await db()).prepare("insert into jikan_cache (key, body, fetched_at) values (?, ?, ?) on conflict(key) do update set body = excluded.body, fetched_at = excluded.fetched_at").bind(key, JSON.stringify(n), now()).run();
    } catch { /* best effort */ }
    return n;
  } catch { return stale; }
}

export async function getFranchise(malId: number): Promise<Franchise | null> {
  const start = await node(malId);
  if (!start) return null;

  // walk prequels and sequels, a level at a time (each level's lookups run together)
  const chain = new Map<number, FranchiseEntry>([[malId, start.self]]);
  const nodes = new Map<number, Node>([[malId, start]]);
  let frontier = [start];
  while (frontier.length && chain.size < MAX_NODES) {
    const want: FranchiseEntry[] = [];
    for (const n of frontier) {
      for (const e of n.edges) {
        if (!CHAIN.has(e.relation) || e.type !== "ANIME" || !e.entry.malId || chain.has(e.entry.malId)) continue;
        if (chain.size + want.length >= MAX_NODES) break;
        chain.set(e.entry.malId, e.entry);
        want.push(e.entry);
      }
    }
    const got = await Promise.all(want.map((w) => node(w.malId)));
    frontier = got.filter((g): g is Node => !!g);
    for (const g of frontier) nodes.set(g.self.malId, g);
  }

  const ordered = [...chain.values()].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.malId - b.malId);
  const seasons = ordered.filter((e) => MAIN_FORMATS.has(e.format ?? "") || e.malId === malId).map((e) => ({ ...e, current: e.malId === malId }));
  const extras = ordered.filter((e) => !MAIN_FORMATS.has(e.format ?? "") && e.malId !== malId);

  const related: FranchiseEntry[] = [];
  let source: FranchiseSource | null = null;
  for (const e of start.edges) {
    if (CHAIN.has(e.relation)) continue;
    if (e.relation === "ADAPTATION" && e.type === "MANGA") {
      const isNovel = /NOVEL/.test(e.entry.format ?? "");
      // a manga beats a light novel when both are listed
      if (!source || (source.kind === "novel" && !isNovel)) source = { title: e.entry.title, format: e.entry.format ?? "MANGA", malId: e.entry.malId || null, kind: isNovel ? "novel" : "manga" };
      continue;
    }
    if (e.type === "ANIME" && e.entry.malId && !chain.has(e.entry.malId)) related.push(e.entry);
  }
  if (seasons.length < 2 && !extras.length && !related.length && !source) return null;
  return { seasons, extras, related, source };
}
