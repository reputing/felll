import { resolveAnivexaStream } from "@/lib/anivexa";
import { memberOr401 } from "@/lib/auth";
import { first } from "@/lib/db";
import { signedStreamUrl } from "@/lib/stream";

// A short-lived playable URL for one source. Members only; Stream URLs are
// signed per request so they can't be hot-linked.
//
// Two kinds of source id:
//   - a number           → a self-hosted `video_sources` row (Cloudflare Stream / HLS)
//   - "anivexa:provider:anilistId:audio:ep" → resolved live via the Anivexa bot
export async function GET(_req: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const raw = (await params).sourceId;

  if (raw.startsWith("anivexa:")) {
    const [, provider, anilistId, audio, ep] = raw.split(":");
    const resolved = await resolveAnivexaStream(provider, Number(anilistId), audio, Number(ep));
    // This player only plays HLS; embeds/DASH fail here so the player falls to
    // the next server.
    if (!resolved || resolved.type !== "hls") {
      return Response.json({ error: "unplayable" }, { status: 404 });
    }
    return Response.json(
      {
        url: resolved.url,
        intro: resolved.intro,
        outro: resolved.outro,
        subtitles: resolved.subtitles.map((s, i) => ({
          id: `a${i}`,
          language: s.lang,
          label: s.label,
          url: s.url,
          is_default: s.default ? 1 : 0,
        })),
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  }

  const id = Number(raw);
  if (!Number.isInteger(id)) return Response.json({ error: "bad source" }, { status: 400 });
  const s = await first<{ provider: string; stream_uid: string | null; hls_url: string | null }>(
    "select provider, stream_uid, hls_url from video_sources where id = ? and status = 'ready'",
    id,
  );
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  const url = s.provider === "cloudflare_stream" ? await signedStreamUrl(s.stream_uid!) : s.hls_url;
  return Response.json({ url }, { headers: { "cache-control": "private, no-store" } });
}
