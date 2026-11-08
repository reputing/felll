// AniList: read a member's lists and write progress back. Reads need only a username (lists are
// public); writes need the member's own personal access token, which they paste in settings.
import type { ListStatus } from "./utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;
const URL_ = "https://graphql.anilist.co";

export async function gql(query: string, variables: Raw, token?: string | null): Promise<Raw> {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as Raw;
  if (!res.ok || body.errors?.length) throw new Error(body.errors?.[0]?.message || `AniList ${res.status}`);
  return body.data;
}

const STATUS_IN: Record<string, ListStatus> = { CURRENT: "watching", REPEATING: "completed", PLANNING: "planning", COMPLETED: "completed", PAUSED: "paused", DROPPED: "dropped" };
const STATUS_OUT: Record<ListStatus, string> = { watching: "CURRENT", planning: "PLANNING", completed: "COMPLETED", paused: "PAUSED", dropped: "DROPPED" };

export interface PulledAnime { malId: number; status: ListStatus; rewatching: boolean; progress: number; score: number | null; title: string; image: string | null; episodes: number | null; format: string | null; repeat: number }
export interface PulledManga { anilistId: number; status: string; progress: number; title: string; cover: string | null }

const ANIME_Q = `query($u:String){MediaListCollection(userName:$u,type:ANIME){lists{entries{status progress repeat score(format:POINT_10)
  media{idMal episodes format title{romaji english} coverImage{large}}}}}}`;
const MANGA_Q = `query($u:String){MediaListCollection(userName:$u,type:MANGA){lists{entries{status progress
  media{id title{romaji english} coverImage{large}}}}}}`;

export async function pullAnime(username: string): Promise<PulledAnime[]> {
  const d = await gql(ANIME_Q, { u: username });
  const out = new Map<number, PulledAnime>();
  for (const l of d?.MediaListCollection?.lists ?? []) {
    for (const e of l.entries ?? []) {
      const m = e.media;
      if (!m?.idMal || !STATUS_IN[e.status]) continue; // our catalog is MAL-keyed
      out.set(m.idMal, {
        malId: m.idMal, status: STATUS_IN[e.status], rewatching: e.status === "REPEATING", progress: e.progress ?? 0,
        score: e.score && e.score >= 1 ? Math.min(10, Math.round(e.score)) : null,
        title: m.title?.english || m.title?.romaji || "Untitled", image: m.coverImage?.large ?? null,
        episodes: m.episodes ?? null, format: m.format ?? null, repeat: e.repeat ?? 0,
      });
    }
  }
  return [...out.values()];
}

export async function pullManga(username: string): Promise<PulledManga[]> {
  const d = await gql(MANGA_Q, { u: username });
  const out: PulledManga[] = [];
  for (const l of d?.MediaListCollection?.lists ?? []) {
    for (const e of l.entries ?? []) {
      const m = e.media;
      if (!m?.id) continue;
      out.push({ anilistId: m.id, status: String(e.status), progress: e.progress ?? 0, title: m.title?.english || m.title?.romaji || "Untitled", cover: m.coverImage?.large ?? null });
    }
  }
  return out;
}

/** Write one anime entry to the member's AniList (needs their token). */
export async function pushAnime(token: string, anilistId: number, p: { status?: ListStatus | null; progress?: number; score?: number | null; rewatching?: boolean }) {
  const vars: Raw = { id: anilistId };
  const decl = ["$id:Int"], args = ["mediaId:$id"];
  if (p.status) { vars.status = p.rewatching && p.status === "completed" ? "REPEATING" : STATUS_OUT[p.status]; decl.push("$status:MediaListStatus"); args.push("status:$status"); }
  if (typeof p.progress === "number") { vars.progress = p.progress; decl.push("$progress:Int"); args.push("progress:$progress"); }
  if (p.score) { vars.score = p.score; decl.push("$score:Float"); args.push("score:$score"); }
  await gql(`mutation(${decl.join(",")}){SaveMediaListEntry(${args.join(",")}){id}}`, vars, token);
}

export async function viewer(token: string): Promise<string | null> {
  const d = await gql("query{Viewer{name}}", {}, token);
  return d?.Viewer?.name ?? null;
}
