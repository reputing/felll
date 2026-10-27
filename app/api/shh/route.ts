import { getCloudflareContext } from "@opennextjs/cloudflare";
import { memberOr401 } from "@/lib/auth";

// The private AI corner (/shh). Members only, and gated by a code (SHH_CODE,
// default "SEMINOLE") that the client sends with every call — so the AI endpoint
// isn't open to anyone who merely has a session.
//
// Upstream is an OpenAI-compatible AI API. Default: Z.ai (GLM) with
// glm-5.3-flash, which is natively multimodal — it reads images. Override with
// AI_API_URL (an OpenAI-style base), AI_API_KEY and AI_MODEL.
/* eslint-disable @typescript-eslint/no-explicit-any */

// Server-side only (this route runs on the Worker, never shipped to browsers).
// The owner chose to hardcode their key; override any of these with env vars.
const DEFAULT_BASE = "https://api.z.ai/api/paas/v4";
const DEFAULT_KEY = "f666f52f00b640c2a1d60ecebb689b25.qiN8pabK9gYcJx5D";
const DEFAULT_MODEL = "glm-5.3-flash";

async function readEnv(): Promise<Record<string, string | undefined>> {
  try {
    return (await getCloudflareContext({ async: true })).env as unknown as Record<string, string | undefined>;
  } catch {
    return process.env as Record<string, string | undefined>;
  }
}

function endpoints(e: Record<string, string | undefined>) {
  const base = e.AI_API_URL?.replace(/\/+$/, "") || DEFAULT_BASE;
  const key = e.AI_API_KEY || DEFAULT_KEY;
  return {
    models: `${base}/models`,
    chat: `${base}/chat/completions`,
    headers: key ? { authorization: `Bearer ${key}` } : ({} as Record<string, string>),
    model: e.AI_MODEL || DEFAULT_MODEL,
  };
}

// Many OpenAI-style /models lists (z.ai included) don't flag vision, so infer it
// from the id: glm-5.3-flash (and later 5.x flashes), and the usual vision tags.
const looksVision = (id: string) => /5\.[3-9]-flash|[-.]v$|\bv\d|vision|4\.5v|4v\b|gpt-4o|gemini|claude/i.test(id);

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
    for (const m of d.data) push(m?.id, m?.id, !!(m?.capabilities?.vision || m?.modalities?.input?.includes?.("image") || m?.vision) || looksVision(String(m?.id ?? "")));
  } else if (Array.isArray(d)) {
    for (const m of d) {
      const id = (Array.isArray(m?.aliases) && m.aliases[0]) || m?.name;
      push(id, m?.description || m?.name, !!(m?.vision || m?.input_modalities?.includes?.("image")) || looksVision(String(id ?? "")));
    }
  }
  return out;
}

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const e = await readEnv();
  if ((new URL(req.url).searchParams.get("code") || "") !== codeOf(e)) return Response.json({ error: "locked" }, { status: 403 });
  const cfg = endpoints(e);
  let models: { id: string; label: string; vision: boolean }[] = [];
  try {
    const r = await fetch(cfg.models, { headers: { accept: "application/json", ...cfg.headers }, signal: AbortSignal.timeout(20_000) });
    models = normalizeModels(await r.json());
  } catch { /* fall through with just the default */ }
  // Always offer the configured default, even if the upstream list omits it.
  if (cfg.model && !models.some((m) => m.id === cfg.model)) models.unshift({ id: cfg.model, label: cfg.model, vision: looksVision(cfg.model) });
  return Response.json({ models, default: cfg.model }, { headers: { "cache-control": "private, max-age=300" } });
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
    const cfg = endpoints(e);
    let r: Response;
    try {
      r = await fetch(cfg.chat, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", ...cfg.headers },
        body: JSON.stringify({ model: b.model || cfg.model, messages, stream: false }),
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
