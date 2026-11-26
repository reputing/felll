import { memberOr401 } from "@/lib/auth";
import { first, run } from "@/lib/db";

// The member's cloak settings (decoy, tab disguise, boss key, anti-flip), kept on their account so they follow them to every
// device. Members only; your own row only; a small JSON object, never anything else.
const MAX = 16_000;

export async function GET() {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const row = await first<{ cloak: string | null }>("select cloak from users where id = ?", me.id).catch(() => null);
  let prefs: unknown = null;
  try { prefs = row?.cloak ? JSON.parse(row.cloak) : null; } catch { /* a damaged value reads as none */ }
  return Response.json({ prefs }, { headers: { "cache-control": "private, no-store" } });
}

export async function PUT(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const text = await req.text();
  if (text.length > MAX) return Response.json({ error: "too large" }, { status: 413 });
  let prefs: unknown;
  try { prefs = (JSON.parse(text) as { prefs?: unknown }).prefs; } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return Response.json({ error: "prefs?" }, { status: 400 });
  const at = Number((prefs as { at?: unknown }).at);
  const body = JSON.stringify({ ...(prefs as object), at: Number.isFinite(at) && at > 0 ? at : Date.now() });
  await run("update users set cloak = ? where id = ?", body, me.id);
  return Response.json({ ok: true });
}
