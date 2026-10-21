import { cookies } from "next/headers";
import { run } from "@/lib/db";
import { safeNext, sessionCookie, startSession } from "@/lib/auth";
import { kuroConfig, kuroProfile, verifyHandoff } from "@/lib/kuro";

// kuro hands a signed-in member back here: /sso?code=<one-time code>&to=<our path>.
// Check kuro signed it, spend it, and start our own session.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = url.searchParams.get("to") || "/";
  const next = safeNext(new URL(to, url.origin).searchParams.get("next"));
  const fail = (error: string) =>
    new Response(null, { status: 303, headers: { location: `/?error=${error}&next=${encodeURIComponent(next)}`, "referrer-policy": "no-referrer", "cache-control": "no-store" } });

  const c = await kuroConfig();
  const v = await verifyHandoff(url.searchParams.get("code") || "", c.serviceKey);
  if (!v) return fail("expired");

  // one use only: a code that leaked through a screenshot or history is dead
  const burned = await run("insert into sso_burned (nonce, expires_at) values (?, ?) on conflict do nothing", v.nonce, Math.ceil(v.exp / 1000));
  if (!burned.meta.changes) return fail("used");
  await run("delete from sso_burned where expires_at < unixepoch()").catch(() => {});

  const profile = await kuroProfile(v.uid);
  if (!profile) return fail("no_account");
  if (c.requirePlus && !profile.plus) return fail("plus_only");

  const t = await startSession(profile, req.headers.get("user-agent") || "");
  (await cookies()).set(sessionCookie(t));
  return new Response(null, { status: 303, headers: { location: next, "referrer-policy": "no-referrer", "cache-control": "no-store" } });
}
