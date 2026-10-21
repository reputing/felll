import { cookies } from "next/headers";
import { SESSION_COOKIE, endSession } from "@/lib/auth";

export async function POST(req: Request) {
  await endSession();
  (await cookies()).delete(SESSION_COOKIE);
  return Response.redirect(new URL("/?bye=1", req.url), 303);
}
