import { memberOr401 } from "@/lib/auth";
import { first } from "@/lib/db";
import { signedStreamUrl } from "@/lib/stream";

// A short-lived playable URL for one source. Members only; Stream URLs are
// signed per request so they can't be hot-linked.
export async function GET(_req: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const id = Number((await params).sourceId);
  if (!Number.isInteger(id)) return Response.json({ error: "bad source" }, { status: 400 });
  const s = await first<{ provider: string; stream_uid: string | null; hls_url: string | null }>(
    "select provider, stream_uid, hls_url from video_sources where id = ? and status = 'ready'",
    id,
  );
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  const url = s.provider === "cloudflare_stream" ? await signedStreamUrl(s.stream_uid!) : s.hls_url;
  return Response.json({ url }, { headers: { "cache-control": "private, no-store" } });
}
