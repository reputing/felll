import { safeNext } from "@/lib/auth";
import { kuroConfig } from "@/lib/kuro";

// "Continue with kuro": hand off through kuro's SSO hub. We send the member to
// kuro's /sso?return=<our url>. If they're signed in there, the hub mints a
// one-time code and bounces them to our /sso?to=…&code=…; if not, it sends them
// back signed-out to use the password form. (The return URL carries ?next so we
// know where to land; kuro copies its path into `to`.)
export async function GET(req: Request) {
  const c = await kuroConfig();
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  if (!c.serviceKey) return Response.redirect(new URL(`/?error=sso_off&next=${encodeURIComponent(next)}`, url), 303);
  const ret = new URL(`/?next=${encodeURIComponent(next)}`, url.origin).toString();
  return Response.redirect(`${c.url}/sso?return=${encodeURIComponent(ret)}`, 303);
}
