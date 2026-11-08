import { cookies } from "next/headers";
import { first, run } from "@/lib/db";
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
  if (!v) {
    // Tell "that link really expired" apart from "kuro signed it with a key we don't
    // hold": a well-formed, unexpired code that fails is almost always KURO_SERVICE_KEY
    // here not matching kuro's service-role key. It used to say "expired" either way, which
    // made a mismatched key look like bad luck on every single try.
    const parts = (url.searchParams.get("code") || "").split(".");
    const live = parts.length === 4 && Number(parts[1]) > Date.now();
    console.error("sso: handoff rejected", live ? "(signature mismatch: check KURO_SERVICE_KEY)" : "(expired or malformed)");
    return fail(live ? "key" : "expired");
  }

  // one use only: a code that leaked through a screenshot or history is dead
  const burned = await run("insert into sso_burned (nonce, expires_at) values (?, ?) on conflict do nothing", v.nonce, Math.ceil(v.exp / 1000));
  if (!burned.meta.changes) return fail("used");
  await run("delete from sso_burned where expires_at < unixepoch()").catch(() => {});

  let profile = await kuroProfile(v.uid);
  if (!profile) {
    // The code was valid, so kuro vouches for this uid; what failed is our lookup of their
    // profile (KURO_SUPABASE_URL unset or unreachable). Password sign-in hid this because it
    // already knows the handle. A returning member has a row here, so let them in on that;
    // only a brand-new member needs the lookup.
    const row = await first<{ handle: string; display_name: string; avatar_url: string | null; bio: string; pronouns: string; is_plus: number }>(
      "select handle, display_name, avatar_url, bio, pronouns, is_plus from users where id = ?", v.uid,
    ).catch(() => null);
    if (row) profile = { uid: v.uid, handle: row.handle, displayName: row.display_name, avatar: row.avatar_url, bio: row.bio, pronouns: row.pronouns, plus: !!row.is_plus };
    else { console.error("sso: no kuro profile for", v.uid, c.supabaseUrl ? "(lookup failed)" : "(KURO_SUPABASE_URL is not set)"); return fail(c.supabaseUrl ? "no_account" : "no_backend"); }
  }
  if (c.requirePlus && !profile.plus) return fail("plus_only");

  const t = await startSession(profile, req.headers.get("user-agent") || "");
  (await cookies()).set(sessionCookie(t));
  return new Response(null, { status: 303, headers: { location: next, "referrer-policy": "no-referrer", "cache-control": "no-store" } });
}
