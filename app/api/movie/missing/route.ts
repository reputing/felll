import { memberOr401 } from "@/lib/auth";
import { reportMissing } from "@/lib/movie-missing";

// POST { imdb, season?, episode? }: "this one would not start for me". Sent by the player when it gives up waiting. Members only; one
// report per member per title per week counts (lib/movie-missing.ts).
export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { imdb?: unknown; season?: unknown; episode?: unknown };
  const imdb = String(b.imdb ?? "");
  const se = Math.floor(Number(b.season) || 0), ep = Math.floor(Number(b.episode) || 0);
  if (!/^tt\d{5,10}$/.test(imdb) || se < 0 || se > 200 || ep < 0 || ep > 10000) return Response.json({ error: "which title?" }, { status: 400 });
  await reportMissing(imdb, se, ep, me.id);
  return Response.json({ ok: true });
}
