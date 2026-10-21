import { cookies } from "next/headers";
import { sessionCookie, startSession } from "@/lib/auth";

// Local development only: a pretend kuro member so the site can be tried
// without kuro credentials. Refuses to run in a production build.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") return new Response("not found", { status: 404 });
  const form = await req.formData().catch(() => null);
  const handle = String(form?.get("handle") || "devcake").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24) || "devcake";
  const t = await startSession(
    { uid: `00000000-0000-4000-8000-${handle.padEnd(12, "0").slice(0, 12).replace(/[^0-9a-f]/g, "a")}`, handle, displayName: handle, avatar: null, bio: "", pronouns: "", plus: true },
    "dev",
  );
  (await cookies()).set(sessionCookie(t));
  return Response.redirect(new URL("/home", req.url), 303);
}
