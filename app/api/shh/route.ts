import { getCloudflareContext } from "@opennextjs/cloudflare";
import { memberOr401 } from "@/lib/auth";

// The private AI corner (/shh). Members only, and gated by a code (SHH_CODE,
// default "SEMINOLE") that the client sends with every call — so the AI endpoint
// isn't open to anyone who merely has a session.
//
// Upstream is an OpenAI-compatible AI API. Default: pollinations.ai (keyless,
// has a model list, some vision models). Override with AI_API_URL (an
// OpenAI-style base, e.g. https://api.llm7.io/v1) and optional AI_API_KEY.
/* eslint-disable @typescript-eslint/no-explicit-any */

async function readEnv(): Promise<Record<string, string | undefined>> {
  try {
    return (await getCloudflareContext({ async: true })).env as unknown as Record<string, string | undefined>;
  } catch {
    return process.env as Record<string, string | undefined>;
  }
}

function endpoints(e: Record<string, string | undefined>) {
  const base = e.AI_API_URL?.replace(/\/+$/, "");
  const key = e.AI_API_KEY;
  if (base) return { models: `${base}/models`, chat: `${base}/chat/completions`, headers: key ? { authorization: `Bearer ${key}` } : {} };
  // pollinations: keyless, non-/v1 paths.
  return { models: "https://text.pollinations.ai/models", chat: "https://text.pollinations.ai/openai", headers: {} as Record<string, string> };
}

const codeOf = (e: Record<string, string | undefined>) => e.SHH_CODE || "SEMINOLE";

// Normalise both the OpenAI `{data:[{id}]}` shape and pollinations' flat array.
function normalizeModels(d: any): { id: string; label: string; vision: boolean }[] {
  const seen = new Set<string>();
  const out: { id: string; label: string; vision: boolean }[] = [];
  const push = (id: unknown, label: unknown, vision: boolean) => {
    const s = typeof id === "string" ? id : typeof id === "number" ? String(id) : "";
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push({ id: s, label: (typeof label === "string" && label) || s, vision });
  };
  if (Array.isArray(d?.data)) {
    for (const m of d.data) push(m?.id, m?.id, !!(m?.capabilities?.vision || m?.modalities?.input?.includes?.("image") || m?.vision));
  } else if (Array.isArray(d)) {
    for (const m of d) {
      const id = (Array.isArray(m?.aliases) && m.aliases[0]) || m?.name;
      push(id, m?.description || m?.name, !!(m?.vision || m?.input_modalities?.includes?.("image")));
    }
  }
  return out;
}

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const e = await readEnv();
  if ((new URL(req.url).searchParams.get("code") || "") !== codeOf(e)) return Response.json({ error: "locked" }, { status: 403 });
  const { models, headers } = endpoints(e);
  try {
    const r = await fetch(models, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(20_000) });
    return Response.json({ models: normalizeModels(await r.json()) }, { headers: { "cache-control": "private, max-age=300" } });
  } catch {
    return Response.json({ models: [] }, { headers: { "cache-control": "no-store" } });
  }
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const e = await readEnv();
  const b = (await req.json().catch(() => ({}))) as { op?: string; code?: string; model?: string; messages?: any[] };
  if ((b.code || "") !== codeOf(e)) return Response.json({ error: "wrong code" }, { status: 403 });

  if (b.op === "unlock") return Response.json({ ok: true });

  if (b.op === "chat") {
    const messages = Array.isArray(b.messages) ? b.messages.slice(-30) : [];
    if (!messages.length) return Response.json({ error: "nothing to send" }, { status: 400 });
    const { chat, headers } = endpoints(e);
    let r: Response;
    try {
      r = await fetch(chat, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", ...headers },
        body: JSON.stringify({ model: b.model || "openai", messages, stream: false }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      return Response.json({ error: "the ai didn't answer — try again" }, { status: 502 });
    }
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* some upstreams return plain text */ }
    const raw = data?.choices?.[0]?.message?.content ?? (data ? null : text);
    const content = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p: any) => p?.text ?? "").join("") : "";
    if (!r.ok || !content.trim()) return Response.json({ error: data?.error?.message || "the ai couldn't answer that" }, { status: r.ok ? 502 : r.status });
    return Response.json({ content }, { headers: { "cache-control": "no-store" } });
  }

  return Response.json({ error: "unknown op" }, { status: 400 });
}
