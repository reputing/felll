import { NextResponse } from "next/server";
import { anivexaEnabled, isAnivexaProvider, resolveAnivexaStream } from "@/lib/anivexa";

// Resolves a single playable stream for one Anivexa provider/episode. Called by
// the player when the viewer picks an external server. HLS/DASH URLs come back
// pointing at /api/anivexa/proxy so Referer-gated playlists play in the browser.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string; anilistId: string; audio: string; ep: string }> },
) {
  const { provider, anilistId, audio, ep } = await params;

  if (!anivexaEnabled()) {
    return NextResponse.json({ error: "Anivexa is not configured" }, { status: 503 });
  }
  const id = Number(anilistId);
  const episode = Number(ep);
  if (!isAnivexaProvider(provider) || (audio !== "sub" && audio !== "dub")) {
    return NextResponse.json({ error: "Invalid provider or audio" }, { status: 400 });
  }
  if (!Number.isInteger(id) || !Number.isFinite(episode)) {
    return NextResponse.json({ error: "Invalid id or episode" }, { status: 400 });
  }

  const resolved = await resolveAnivexaStream(provider, id, audio, episode);
  if (!resolved) {
    return NextResponse.json({ error: "No stream available" }, { status: 404 });
  }
  return NextResponse.json(resolved, {
    headers: { "cache-control": "private, max-age=60" },
  });
}
