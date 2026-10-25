import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, first, now, run } from "./db";
import { kuroConfig, type KuroProfile } from "./kuro";

// Our own session, started once kuro has vouched for someone (lib/kuro.ts).
// The cookie holds a random token; D1 stores only its SHA-256.

export const SESSION_COOKIE = "cupcake_session";
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
  return to;
}
