import { cookies } from "next/headers";
import { KNOWN_COOKIE, SESSION_COOKIE } from "@/lib/auth";

// A device that was signed out from another device ends up here (the front door sends it). Its cookies are cleared, so it is a
// stranger again, and it is sent back to the front door, which shows the "unavailable" page. ?out=1 tells the page to stay shut
// even in a tab where the sign-in had been opened earlier.
export async function GET(req: Request) {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(KNOWN_COOKIE);
  return Response.redirect(new URL("/?out=1", req.url), 303);
}
