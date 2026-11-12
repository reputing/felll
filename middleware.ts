import { NextResponse, type NextRequest } from "next/server";

// Plain http is sent to https. The session cookie is `Secure`, so a browser on http (an iPhone typing "cupcake.gg" with no
// scheme lands there) silently refuses to keep it: the sign-in succeeds on the server, the cookie never sticks, and the
// portal comes straight back, which looks like a login that spins and then does nothing. Cloudflare's own "Always Use
// HTTPS" zone setting was off, so the redirect lives here.
//
// It acts only on Cloudflare's `cf-visitor` header, which says which scheme the visitor really used. The request's own url
// is not trusted for this (the local runtime rewrites it), and with no header (local development, a direct call) nothing
// happens, so this can never redirect an https visitor to https.
export function middleware(req: NextRequest) {
  const visitor = req.headers.get("cf-visitor");
  if (visitor) {
    let scheme = "";
    try { scheme = String(JSON.parse(visitor).scheme || ""); } catch { /* not ours */ }
    if (scheme === "http") return NextResponse.redirect(`https://${req.nextUrl.host}${req.nextUrl.pathname}${req.nextUrl.search}`, 308);
  }
  return NextResponse.next();
}

// everything but static files, which carry no cookies and are cached at the edge anyway
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.png|logo.png).*)"] };
