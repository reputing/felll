import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { signedStreamUrl } from "@/lib/stream";

// Returns a short-lived playable URL for one self-hosted video source. Only
// ready sources of published episodes are exposed.
export async function GET(_req: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const id = Number((await params).sourceId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid source" }, { status: 400 });

  let source: { provider: string; stream_uid: string | null; hls_url: string | null } | null;
  try {
    source = await queryOne(
      `SELECT s.provider AS provider, s.stream_uid AS stream_uid, s.hls_url AS hls_url
       FROM video_sources s
       JOIN episodes e ON e.id = s.episode_id
       JOIN anime a ON a.id = e.anime_id
       WHERE s.id = ? AND s.status = 'ready' AND e.is_published = 1 AND a.is_published = 1`,
      [id],
    );
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url =
    source.provider === "cloudflare_stream" ? await signedStreamUrl(source.stream_uid!) : source.hls_url;
  return NextResponse.json({ url }, { headers: { "cache-control": "private, no-store" } });
}
