import { memberOr401 } from "@/lib/auth";
import { all, run } from "@/lib/db";

// Crowd-sourced intro/outro skip markers. Members mark where the intro ends and
// the outro starts; the resolved marker is the median of their submissions, so
// one stray tap doesn't throw it off. Used by the player as a fallback when a
// provider (or the vault) didn't ship its own markers.

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function resolve(malId: number, ep: number) {
  let rows: { kind: string; start_s: number; end_s: number }[] = [];
  try {
    rows = await all("select kind, start_s, end_s from skip_markers where mal_id = ? and episode = ?", malId, ep);
  } catch {
    return { intro: null, outro: null };
  }
  const mk = (kind: string) => {
    const g = rows.filter((r) => r.kind === kind);
    return g.length ? { start: Math.round(median(g.map((r) => r.start_s))), end: Math.round(median(g.map((r) => r.end_s))) } : null;
  };
  return { intro: mk("intro"), outro: mk("outro") };
}

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const u = new URL(req.url);
  return Response.json(await resolve(Number(u.searchParams.get("malId")), Number(u.searchParams.get("ep"))), { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { malId?: number; ep?: number; kind?: string; start?: number; end?: number };
  const malId = Number(b.malId), ep = Number(b.ep);
  const start = Number(b.start), end = Number(b.end);
  if (!Number.isInteger(malId) || !Number.isInteger(ep) || (b.kind !== "intro" && b.kind !== "outro")) return Response.json({ error: "bad" }, { status: 400 });
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > 36000) return Response.json({ error: "bad range" }, { status: 400 });
  try {
    await run(
      `insert into skip_markers (mal_id, episode, kind, user_id, start_s, end_s) values (?, ?, ?, ?, ?, ?)
       on conflict(mal_id, episode, kind, user_id) do update set start_s = excluded.start_s, end_s = excluded.end_s, created_at = unixepoch()`,
      malId, ep, b.kind, me.id, start, end,
    );
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  return Response.json(await resolve(malId, ep));
}
