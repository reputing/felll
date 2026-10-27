import { getCloudflareContext } from "@opennextjs/cloudflare";
import { memberOr401 } from "@/lib/auth";
import { all, first, run } from "@/lib/db";

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

const pickContent = (msg: any): string => {
  const raw = msg?.content;
  return typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p: any) => p?.text ?? "").join("") : "";
};

// ---- code execution (the "run code" tool) -------------------------------------
// Code runs in Wandbox's public sandbox — isolated and ephemeral, never on our
// Worker or the viewer's machine. We only proxy code → Wandbox → output.
const WANDBOX: Record<string, string> = {
  python: "cpython-3.14.0", py: "cpython-3.14.0", python3: "cpython-3.14.0",
  javascript: "nodejs-20.17.0", js: "nodejs-20.17.0", node: "nodejs-20.17.0",
  typescript: "typescript-5.6.2", ts: "typescript-5.6.2",
  c: "gcc-head-c", "c++": "gcc-head", cpp: "gcc-head", cxx: "gcc-head",
  go: "go-1.23.2", golang: "go-1.23.2", ruby: "ruby-3.4.9", rb: "ruby-3.4.9",
  php: "php-8.3.12", bash: "bash", sh: "bash", shell: "bash",
  rust: "rust-1.82.0", rs: "rust-1.82.0", java: "openjdk-jdk-22+36",
  "c#": "mono-6.12.0.199", csharp: "mono-6.12.0.199", cs: "mono-6.12.0.199",
};
async function runCode(language: string, code: string): Promise<string> {
  const lang = String(language ?? "").toLowerCase().trim();
  const compiler = WANDBOX[lang] || (lang.startsWith("py") ? WANDBOX.python : "");
  if (!compiler) return `error: unsupported language "${language}". try python, javascript, go, c, c++, ruby, php, bash, rust, java or c#.`;
  if (!code?.trim()) return "error: no code";
  try {
    const r = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, compiler }), signal: AbortSignal.timeout(28_000),
    });
    if (!r.ok) return `execution service error (${r.status})`;
    const d: any = await r.json();
    const out = [d.compiler_error, d.program_output, d.program_error].filter((s) => s && String(s).trim()).join("\n").trim();
    return (out || "(ran with no output)").slice(0, 5000);
  } catch { return "execution timed out or failed"; }
}
const RUN_TOOL = {
  type: "function",
  function: {
    name: "run_code",
    description: "Execute code in an isolated sandbox and get its output (stdout/stderr). Use it for calculations, data work, testing snippets, anything better answered by running code. Supported languages: python, javascript, typescript, c, c++, go, ruby, php, bash, rust, java, c#.",
    parameters: { type: "object", properties: { language: { type: "string", description: "e.g. python, javascript, go" }, code: { type: "string", description: "a complete program that prints its result" } }, required: ["language", "code"] },
  },
};

// The latest user turn as plain text (content can be a string or a multimodal array).
function lastUserText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) return m.content.filter((p: any) => p?.type === "text").map((p: any) => p?.text ?? "").join(" ");
  }
  return "";
}

// "Look up" (keyless): read any URLs in the message, otherwise run a web search —
// DuckDuckGo fetched through r.jina.ai, which returns clean result text (titles,
// links, snippets). Returns context text for the model; empty on failure.
async function lookup(query: string): Promise<string> {
  const out: string[] = [];
  const urls = [...new Set(query.match(/https?:\/\/[^\s<>"')]+/g) || [])].slice(0, 3);
  if (urls.length) {
    await Promise.all(urls.map(async (u) => {
      try {
        const r = await fetch(`https://r.jina.ai/${u}`, { headers: { accept: "text/plain" }, signal: AbortSignal.timeout(22_000) });
        if (r.ok) out.push(`SOURCE ${u}:\n${(await r.text()).slice(0, 6000)}`);
      } catch { /* skip this url */ }
    }));
  } else {
    const q = query.replace(/\s+/g, " ").trim().slice(0, 200);
    if (q) {
      try {
        const r = await fetch(`https://r.jina.ai/https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`, { headers: { accept: "text/plain" }, signal: AbortSignal.timeout(25_000) });
        if (r.ok) { const t = (await r.text()).trim(); if (t) out.push("WEB SEARCH RESULTS (DuckDuckGo):\n" + t.slice(0, 8000)); }
      } catch { /* search failed */ }
    }
  }
  return out.join("\n\n---\n\n");
}

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
  const docs = await all<{ id: string; name: string }>("select id, name from shh_docs where user_id = ? order by created_at", me.id).catch(() => []);
  return Response.json({ models, default: cfg.model, instructions: me.shh_instructions ?? "", docs }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const e = await readEnv();
  const b = (await req.json().catch(() => ({}))) as { op?: string; code?: string; model?: string; messages?: any[]; web?: boolean; exec?: boolean; instructions?: string; name?: string; content?: string; id?: string };
  if ((b.code || "") !== codeOf(e)) return Response.json({ error: "wrong code" }, { status: 403 });

  if (b.op === "unlock") return Response.json({ ok: true });

  // Persistent setup: custom instructions / memory, and reference files.
  if (b.op === "save_instructions") {
    const v = String(b.instructions ?? "").slice(0, 20_000).trim();
    await run("update users set shh_instructions = ? where id = ?", v || null, me.id);
    return Response.json({ ok: true });
  }
  if (b.op === "add_file") {
    const name = String(b.name ?? "").slice(0, 120).trim();
    const content = String(b.content ?? "").slice(0, 300_000);
    if (!name || !content.trim()) return Response.json({ error: "empty file" }, { status: 400 });
    const n = await first<{ n: number }>("select count(*) as n from shh_docs where user_id = ?", me.id);
    if ((n?.n ?? 0) >= 30) return Response.json({ error: "that's a lot of files — remove one first" }, { status: 400 });
    const id = crypto.randomUUID();
    await run("insert into shh_docs (id, user_id, name, content) values (?, ?, ?, ?)", id, me.id, name, content);
    return Response.json({ id, name });
  }
  if (b.op === "remove_file") {
    if (b.id) await run("delete from shh_docs where id = ? and user_id = ?", b.id, me.id);
    return Response.json({ ok: true });
  }

  if (b.op === "chat") {
    // Uncapped history — the owner wants the full conversation sent each time.
    let messages = Array.isArray(b.messages) ? b.messages : [];
    if (!messages.length) return Response.json({ error: "nothing to send" }, { status: 400 });
    const cfg = endpoints(e);
    // Prepend the member's persistent setup (instructions/memory + reference
    // files it always uses) and, when web is on, the look-up findings.
    const preamble: any[] = [];
    const refParts: string[] = [];
    if (me.shh_instructions && me.shh_instructions.trim()) refParts.push("INSTRUCTIONS / MEMORY:\n" + me.shh_instructions.trim());
    const refDocs = await all<{ name: string; content: string }>("select name, content from shh_docs where user_id = ? order by created_at", me.id).catch(() => []);
    let budget = 200_000;
    for (const d of refDocs) {
      const block = `--- reference file: ${d.name} ---\n${d.content}`;
      if (block.length > budget) { if (budget > 2000) refParts.push(block.slice(0, budget)); break; }
      refParts.push(block);
      budget -= block.length;
    }
    if (refParts.length) preamble.push({ role: "system", content: "The user set up this persistent context for you — always use it:\n\n" + refParts.join("\n\n") });
    if (b.web) {
      const ctx = await lookup(lastUserText(messages));
      preamble.push({ role: "system", content: ctx
        ? "You have live web access for this question. Freshly fetched web content is below — use it to answer and cite the sources (titles/URLs) you rely on.\n\n" + ctx.slice(0, 18000)
        : "A web lookup ran for this question but returned nothing useful — answer from your own knowledge and say the web turned up nothing." });
    }
    if (preamble.length) messages = [...preamble, ...messages];

    // Code execution: give the model the run_code tool and loop, running each
    // tool call in the sandbox and feeding the output back, until it answers.
    if (b.exec) {
      const convo = [...messages];
      const steps: { language: string; code: string; output: string }[] = [];
      for (let it = 0; it < 6; it++) {
        let rr: Response;
        try {
          rr = await fetch(cfg.chat, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json", ...cfg.headers },
            body: JSON.stringify({ model: b.model || cfg.model, messages: convo, tools: [RUN_TOOL], stream: false }),
            signal: AbortSignal.timeout(90_000),
          });
        } catch {
          return Response.json({ error: "the ai didn't answer — try again", steps }, { status: 502 });
        }
        const d: any = await rr.json().catch(() => null);
        const c = d?.choices?.[0];
        if (!rr.ok || !c) return Response.json({ error: d?.error?.message || "the ai couldn't answer that", steps }, { status: rr.ok ? 502 : rr.status });
        const tcs = c?.message?.tool_calls;
        if (c.finish_reason === "tool_calls" && Array.isArray(tcs) && tcs.length) {
          convo.push(c.message);
          for (const tc of tcs) {
            let args: any = {};
            try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* bad args */ }
            const output = await runCode(args.language, args.code);
            steps.push({ language: String(args.language ?? ""), code: String(args.code ?? ""), output });
            convo.push({ role: "tool", tool_call_id: tc.id, content: output });
          }
          continue;
        }
        return Response.json({ content: pickContent(c.message) || "(done)", steps }, { headers: { "cache-control": "no-store" } });
      }
      return Response.json({ content: "(stopped after several code steps — ask me to continue)", steps }, { headers: { "cache-control": "no-store" } });
    }

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
