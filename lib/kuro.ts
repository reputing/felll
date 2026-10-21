import { env } from "./db";

// Signing in with a kuro account (kuro.rip, formerly kirari.cafe).
//
// Two ways in, both ending with a kuro uid we trust:
//
// 1. SSO hand-off, the same one kuro's sister sites use (kirari lib/sso.ts).
//    We send the visitor to  <KURO_URL>/sso?return=<our /portal>.  If they are
//    signed in there, kuro mints a one-time code "<uidB64>.<exp>.<nonce>.<sig>"
//    (HMAC-SHA256 keyed with kuro's service key, valid ~2 min) and bounces to
//    our /sso?code=…&to=…, where we check the signature, spend the nonce and
//    start our own session. Needs KURO_SERVICE_KEY, and this site's domain in
//    kirari's SISTER_SITES (lib/domains.ts).
//
// 2. Handle + password, through kuro's own app sign-in (POST /api/app-login),
//    which the kuro desktop and phone apps use. Works with no shared secret.

const enc = new TextEncoder();

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToB64url(b: ArrayBuffer): string {
  let s = "";
  for (const x of new Uint8Array(b)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function kuroConfig() {
  const e = await env();
  return {
    url: (e.KURO_URL || "https://kuro.rip").replace(/\/+$/, ""),
    supabaseUrl: (e.KURO_SUPABASE_URL || "").replace(/\/+$/, ""),
    serviceKey: e.KURO_SERVICE_KEY || "",
    requirePlus: e.REQUIRE_KURO_PLUS === "1",
    admins: (e.ADMIN_HANDLES || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean),
  };
}

/** The uid and nonce in a kuro hand-off code, if it is well formed, signed by kuro and unexpired. */
export async function verifyHandoff(code: string, secret: string): Promise<{ uid: string; nonce: string; exp: number } | null> {
  const parts = (code || "").split(".");
  if (parts.length !== 4 || !secret) return null;
  const [uidB64, expStr, nonce, sig] = parts;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(sig), enc.encode(`${uidB64}.${expStr}.${nonce}`));
  } catch {
    return null;
  }
  const exp = Number(expStr);
  if (!ok || !Number.isFinite(exp) || Date.now() > exp || !/^[\w-]{16,}$/.test(nonce)) return null;
  try {
    const uid = new TextDecoder().decode(b64urlToBytes(uidB64));
    return /^[0-9a-f-]{36}$/i.test(uid) ? { uid, nonce, exp } : null;
  } catch {
    return null;
  }
}

// exported for tests and the dev mint
export async function signHandoff(uid: string, secret: string, ttlMs = 120_000): Promise<string> {
  const nonce = bytesToB64url(crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer);
  const payload = `${bytesToB64url(enc.encode(uid).buffer as ArrayBuffer)}.${Date.now() + ttlMs}.${nonce}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `${payload}.${bytesToB64url(await crypto.subtle.sign("HMAC", key, enc.encode(payload)))}`;
}

export interface KuroProfile {
  uid: string;
  handle: string;
  displayName: string;
  avatar: string | null;
  bio: string;
  pronouns: string;
  plus: boolean;
}

async function rest<T>(path: string): Promise<T | null> {
  const c = await kuroConfig();
  if (!c.supabaseUrl || !c.serviceKey) return null;
  const res = await fetch(`${c.supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: c.serviceKey, authorization: `Bearer ${c.serviceKey}`, accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as T;
}

/** A kuro member's public profile; null if there is no such account or it is banned. */
export async function kuroProfile(uid: string, fallbackHandle?: string): Promise<KuroProfile | null> {
  const c = await kuroConfig();
  const rows = await rest<{ handle: string; display_name: string; pfp_url: string | null; bio: string | null; pronouns: string | null }[]>(
    `profiles?id=eq.${encodeURIComponent(uid)}&select=handle,display_name,pfp_url,bio,pronouns`,
  );
  const p = rows?.[0];
  if (!p && !fallbackHandle) return null;
  const handle = (p?.handle || fallbackHandle || "").toLowerCase();

  const [banned, page] = await Promise.all([
    rest<{ handle: string }[]>(`banned_handles?handle=eq.${encodeURIComponent(handle)}&select=handle`),
    rest<{ data: { profile?: { premium?: boolean; premiumUntil?: number } } }[]>(
      `pages?handle=eq.${encodeURIComponent(handle)}&select=data`,
    ),
  ]);
  if (banned?.length) return null;
  const prof = page?.[0]?.data?.profile;
  const plus = !!prof?.premium && (prof.premiumUntil == null || prof.premiumUntil > Date.now());

  let avatar = p?.pfp_url || null;
  // kuro serves member media through its own proxy, never raw storage urls
  if (avatar && avatar.startsWith("/")) avatar = c.url + avatar;
  return {
    uid,
    handle,
    displayName: p?.display_name || handle,
    avatar,
    bio: p?.bio || "",
    pronouns: p?.pronouns || "",
    plus,
  };
}

/** kuro's app sign-in. Returns the uid and canonical handle, or an error message to show. */
export async function kuroPasswordLogin(handle: string, password: string, ip: string): Promise<{ uid: string; handle: string } | { error: string }> {
  const c = await kuroConfig();
  const res = await fetch(`${c.url}/api/app-login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ handle, password }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res) return { error: "couldn't reach kuro, try again in a moment" };
  const body = (await res.json().catch(() => ({}))) as { error?: string; handle?: string; session?: { user?: { id?: string } } };
  if (!res.ok || !body.session?.user?.id) return { error: body.error || "wrong handle or password" };
  return { uid: body.session.user.id, handle: String(body.handle || handle).toLowerCase() };
}
