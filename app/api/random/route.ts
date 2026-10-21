import { currentUser } from "@/lib/auth";
import { getRandomId } from "@/lib/jikan";

export async function GET(req: Request) {
  if (!(await currentUser())) return Response.redirect(new URL("/", req.url), 303);
  let id: number | null = null;
  for (let i = 0; i < 3 && !id; i++) id = await getRandomId();
  return Response.redirect(new URL(id ? `/anime/${id}?surprise=1` : "/browse", req.url), 303);
}
