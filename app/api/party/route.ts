import { memberOr401 } from "@/lib/auth";
import { first, now, run } from "@/lib/db";

// Watch Together: a lightweight, pollable sync room. The host heartbeats its
// playback state here; members poll it and follow along. State lives in the
// jikan_cache key/body store (no schema migration needed) under `party:<code>`.
// A room is "alive" while its host has beaten within ALIVE seconds.
const ALIVE = 15;

interface Room {
  hostId: string;
  hostName: string;
  malId: number;
  ep: number;
  position: number;
  paused: boolean;
}

const key = (code: string) => `party:${code.replace(/[^a-z0-9]/gi, "").slice(0, 12)}`;

async function load(code: string): Promise<{ room: Room; age: number } | null> {
  const row = await first<{ body: string; fetched_at: number }>(
    "select body, fetched_at from jikan_cache where key = ?",
    key(code),
  );
  if (!row) return null;
  try {
    return { room: JSON.parse(row.body) as Room, age: now() - row.fetched_at };
  } catch {
    return null;
  }
}

// GET /api/party?code=XXXX — the current room state (for members to follow).
export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!code) return Response.json({ error: "no code" }, { status: 400 });
  const found = await load(code);
  if (!found) return Response.json({ exists: false }, { headers: { "cache-control": "no-store" } });
  const { room, age } = found;
  return Response.json(
    { exists: true, alive: age < ALIVE, isHost: room.hostId === me.id, malId: room.malId, ep: room.ep, position: room.position, paused: room.paused, host: room.hostName, age },
    { headers: { "cache-control": "no-store" } },
  );
}

// POST /api/party — the host heartbeat. Creates the room on first beat and keeps
// it fresh. A different, still-alive host can't be clobbered.
export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const body = (await req.json().catch(() => null)) as
    | { code?: string; malId?: number; ep?: number; position?: number; paused?: boolean }
    | null;
  if (!body?.code || !Number.isInteger(body.malId) || !Number.isInteger(body.ep)) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const existing = await load(body.code);
  if (existing && existing.room.hostId !== me.id && existing.age < ALIVE) {
    return Response.json({ error: "taken" }, { status: 409 });
  }
  const room: Room = {
    hostId: me.id,
    hostName: me.display_name || me.handle,
    malId: body.malId!,
    ep: body.ep!,
    position: Math.max(0, Number(body.position) || 0),
    paused: !!body.paused,
  };
  await run(
    "insert into jikan_cache (key, body, fetched_at) values (?, ?, ?) on conflict(key) do update set body = excluded.body, fetched_at = excluded.fetched_at",
    key(body.code),
    JSON.stringify(room),
    now(),
  );
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

export const dynamic = "force-dynamic";
