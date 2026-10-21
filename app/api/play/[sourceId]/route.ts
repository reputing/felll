import { NextResponse } from "next/server";
import { signedStreamUrl } from "@/lib/stream";
import { supabase } from "@/lib/supabase";

// Returns a short-lived playable URL for one video source. Row level security
// only exposes ready sources of published episodes.
export async function GET(_req: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const id = Number((await params).sourceId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid source" }, { status: 400 });

  const { data: source, error } = await supabase()
    .from("video_sources")
    .select("provider, stream_uid, hls_url")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url =
    source.provider === "cloudflare_stream" ? await signedStreamUrl(source.stream_uid) : source.hls_url;
  return NextResponse.json({ url }, { headers: { "cache-control": "private, no-store" } });
}
