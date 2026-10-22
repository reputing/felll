import { safeNext } from "@/lib/auth";
import { kuroConfig } from "@/lib/kuro";

// "Continue with kuro": hand off through kuro's landing. If they're already
// signed in there, kuro mints a one-time code and bounces them to our
// /sso?to=…&code=…; if not, ?login=1 opens its sign-in, then it hands back the
// same way. The ?then return URL carries ?next so we know where to land.
export async function GET(req: Request) {
  const c = await kuroConfig();
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  if (!c.serviceKey) return Response.redirect(new URL(`/?error=sso_off&next=${encodeURIComponent(next)}`, url), 303);
  // Hand off through kuro's landing: ?then is where to come back to (our /sso
  // gets the code), ?login=1 opens its sign-in if they're not already in. If
  // they are, kuro hands back immediately. (Silent /sso?return= skips login.)
  const ret = new URL(`/?next=${encodeURIComponent(next)}`, url.origin).toString();
  return Response.redirect(`${c.url}/?login=1&then=${encodeURIComponent(ret)}`, 303);
}
