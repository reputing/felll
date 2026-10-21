import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Feeds the "trending" sort. One call per episode page load.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { animeId?: unknown } | null;
  const animeId = Number(body?.animeId);
  if (!Number.isInteger(animeId)) return NextResponse.json({ error: "Invalid anime" }, { status: 400 });

  const { error } = await supabase().rpc("record_view", { p_anime_id: animeId });
  if (error) return NextResponse.json({ error: "Failed" }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
