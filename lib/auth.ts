import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { all, db, first, now, run } from "./db";
import { kuroConfig, type KuroProfile } from "./kuro";

// Our own session, started once kuro has vouched for someone (lib/kuro.ts).
// The cookie holds a random token; D1 stores only its SHA-256.

export const SESSION_COOKIE = "cupcake_session";
/** Set once someone has signed in on this browser and never cleared by signing out: the front door shows a returning member the real
 *  sign-in instead of the "unavailable" page (see components/portal/secret-gate.tsx). It carries no identity. */
export const KNOWN_COOKIE = "cupcake_known";
const SESSION_DAYS = 30;

export interface User {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string;
  pronouns: string;
  accent: string;
  theme: string;
  status_text: string;
  showcase: string;
  is_plus: number;
  is_admin: number;
  adult_ok: number; // admin-granted access to 18+ sources
  private_lists: number;
  hide_reading: number; // when 1, don't broadcast what they're reading to presence
  shh_label: string | null; // custom label for the /shh tab
  hide_slogan: number; // when 1, hide the cupcake.gg wordmark in the header
  shh_instructions: string | null; // persistent instructions / memory for the /shh AI
  created_at: number;
  last_seen: number;
}

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function token() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Create or refresh the member from their kuro profile and start a session. Returns the cookie value. */
export async function startSession(p: KuroProfile, userAgent: string): Promise<string> {
  const c = await kuroConfig();
  const t = token();
  const d = await db();
  await d.batch([
    d
      .prepare(
        `insert into users (id, handle, display_name, avatar_url, bio, pronouns, is_plus, is_admin)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         on conflict(id) do update set handle = ?2, avatar_url = coalesce(?4, users.avatar_url),
           is_plus = ?7, is_admin = ?8, last_seen = unixepoch()`,
      )
      .bind(p.uid, p.handle, p.displayName.slice(0, 40), p.avatar, p.bio.slice(0, 300), p.pronouns.slice(0, 24), p.plus ? 1 : 0, c.admins.includes(p.handle) ? 1 : 0),
    d
      .prepare("insert into sessions (id, user_id, expires_at, user_agent) values (?, ?, ?, ?)")
      .bind(await sha256(t), p.uid, now() + SESSION_DAYS * 86400, userAgent.slice(0, 200)),
    d.prepare("delete from sessions where expires_at < unixepoch()"),
  ]);
  try { (await cookies()).set({ name: KNOWN_COOKIE, value: "1", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 400 * 86400 }); } catch { /* not in a request that can set cookies */ }
  return t;
}

export const sessionCookie = (value: string) => ({
  name: SESSION_COOKIE,
  value,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86400,
});

/** The signed-in member, or null. One D1 query, shared by everything in a request. */
export const currentUser = cache(async (): Promise<User | null> => {
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!t) return null;
  try {
    return await first<User>(
      `select u.* from sessions s join users u on u.id = s.user_id
       where s.id = ? and s.expires_at > unixepoch()`,
      await sha256(t),
    );
  } catch {
    return null;
  }
});

/** For pages: the member, or off to the portal. */
/** Admin if flagged on the row OR their handle is in ADMIN_HANDLES right now
 *  (so granting admin takes effect without waiting for a fresh sign-in). */
export async function isAdmin(u: User | null | undefined): Promise<boolean> {
  if (!u) return false;
  if (u.is_admin === 1) return true;
  try {
    return (await kuroConfig()).admins.includes(u.handle.toLowerCase());
  } catch {
    return false;
  }
}

export async function requireMember(next?: string): Promise<User> {
  const u = await currentUser();
  if (!u) redirect(next ? `/?next=${encodeURIComponent(next)}` : "/");
  return u;
}

/** For API routes: the member, or a 401 to return. */
export async function memberOr401(): Promise<User | Response> {
  const u = await currentUser();
  return u ?? Response.json({ error: "sign in with your kuro account" }, { status: 401 });
}

export async function endSession() {
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  if (t) await run("delete from sessions where id = ?", await sha256(t)).catch(() => {});
}

/** Only same-site relative paths, so ?next= can't send anyone off-site. */
export function safeNext(to: string | null | undefined): string {
  if (!to || !/^\/(?![/\\])/.test(to)) return "/home";
  // Browsers drop tabs and newlines when they parse a url, so "/<tab>/evil.com" would become "//evil.com". Nothing in a path
  // we send people to has a control character in it.
  if (/[\u0000-\u001f\u007f]/.test(to)) return "/home";
  return to;
}

// --- your signed-in devices -------------------------------------------------------------------------------------------------
// A session is one row per sign-in. The public handle for a row is the first 16 characters of its id (itself a SHA-256 of the
// cookie, so it cannot be used to sign in), and every lookup is also scoped to the member's own user id.
export interface DeviceSession { sid: string; created_at: number; expires_at: number; user_agent: string; current: boolean }

export async function mySessions(userId: string): Promise<DeviceSession[]> {
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  const mine = t ? await sha256(t) : "";
  const rows = await all<{ id: string; created_at: number; expires_at: number; user_agent: string }>(
    "select id, created_at, expires_at, user_agent from sessions where user_id = ? and expires_at > unixepoch() order by created_at desc limit 50",
    userId,
  );
  return rows.map((r) => ({ sid: r.id.slice(0, 16), created_at: r.created_at, expires_at: r.expires_at, user_agent: r.user_agent, current: r.id === mine }));
}

/** Sign one device out. Returns whether it was the device making the request. */
export async function revokeSession(userId: string, sid: string): Promise<{ ok: boolean; self: boolean }> {
  if (!/^[A-Za-z0-9_-]{16}$/.test(sid)) return { ok: false, self: false };
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  const mine = t ? await sha256(t) : "";
  const row = await first<{ id: string }>("select id from sessions where user_id = ? and substr(id, 1, 16) = ?", userId, sid);
  if (!row) return { ok: false, self: false };
  await run("delete from sessions where id = ? and user_id = ?", row.id, userId);
  return { ok: true, self: row.id === mine };
}

/** Sign out every device but this one. Returns how many were signed out. */
export async function revokeOthers(userId: string): Promise<number> {
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  const mine = t ? await sha256(t) : "";
  const before = await first<{ n: number }>("select count(*) as n from sessions where user_id = ? and id != ?", userId, mine);
  await run("delete from sessions where user_id = ? and id != ?", userId, mine);
  return before?.n ?? 0;
}
