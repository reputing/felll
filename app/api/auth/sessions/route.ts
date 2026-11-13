import { cookies } from "next/headers";
import { SESSION_COOKIE, memberOr401, mySessions, revokeOthers, revokeSession } from "@/lib/auth";

// Your own signed-in devices: list them, sign one out, or sign out all the others. Members only, and only ever your own rows.
export async function GET() {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  return Response.json({ sessions: await mySessions(me.id) }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const body = (await req.json().catch(() => null)) as { op?: string; sid?: string } | null;
  if (body?.op === "revoke" && typeof body.sid === "string") {
    const r = await revokeSession(me.id, body.sid);
    if (!r.ok) return Response.json({ error: "that device isn't signed in any more" }, { status: 404 });
    // signing out the device you are on ends your own session: clear its cookie too
    if (r.self) (await cookies()).delete(SESSION_COOKIE);
    return Response.json({ ok: true, self: r.self });
  }
  if (body?.op === "others") return Response.json({ ok: true, count: await revokeOthers(me.id) });
  return Response.json({ error: "unknown request" }, { status: 400 });
}
