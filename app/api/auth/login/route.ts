import { cookies } from "next/headers";
import { sessionCookie, startSession } from "@/lib/auth";
import { kuroConfig, kuroPasswordLogin, kuroProfile } from "@/lib/kuro";

// Handle + password, checked by kuro itself (its app sign-in). We never store
// the password; it goes straight to kuro over https.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { handle?: string; password?: string };
  const handle = String(body.handle || "").replace(/^@+/, "").trim().toLowerCase().slice(0, 32);
  const password = String(body.password || "").slice(0, 200);
  if (!handle || !password) return Response.json({ error: "enter your kuro handle and password" }, { status: 400 });

  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const r = await kuroPasswordLogin(handle, password, ip);
  if ("error" in r) return Response.json({ error: r.error }, { status: 401 });

  const c = await kuroConfig();
  const profile = await kuroProfile(r.uid, r.handle);
  if (!profile) return Response.json({ error: "this kuro account can’t use cupcake" }, { status: 403 });
  if (c.requirePlus && !profile.plus) return Response.json({ error: "cupcake is for kuro+ members right now" }, { status: 403 });

  const t = await startSession(profile, req.headers.get("user-agent") || "");
  (await cookies()).set(sessionCookie(t));
  return Response.json({ ok: true });
}
