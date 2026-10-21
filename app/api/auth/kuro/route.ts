import { safeNext } from "@/lib/auth";
import { kuroConfig } from "@/lib/kuro";

// "Continue with kuro": off to kuro's front door with where to come back to.
// Signed in there already → kuro hands straight back through /sso with a
// one-time code; otherwise it asks them to sign in first, then hands back.
export async function GET(req: Request) {
  const c = await kuroConfig();
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  if (!c.serviceKey) return Response.redirect(new URL(`/?error=sso_off&next=${encodeURIComponent(next)}`, url), 303);
  const back = new URL(`/?sso=1&next=${encodeURIComponent(next)}`, url.origin).toString();
  return Response.redirect(`${c.url}/?login=1&then=${encodeURIComponent(back)}`, 303);
}
