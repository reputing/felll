import { getCloudflareContext } from "@opennextjs/cloudflare";
import { memberOr401 } from "@/lib/auth";
import { all, first, run } from "@/lib/db";
import { STRENGTHS, TONES, buildStyleGuide, humanizeText, type Strength, type Tone } from "@/lib/humanize";

// The private AI corner (/shh). Members only, and gated by a code (SHH_CODE,
// default "SEMINOLE") that the client sends with every call — so the AI endpoint
// isn't open to anyone who merely has a session.
//
// Upstream is an OpenAI-compatible AI API. Default: Z.ai (GLM) with
// glm-5.3-flash, which is natively multimodal — it reads images. Override with
// AI_API_URL (an OpenAI-style base), AI_API_KEY and AI_MODEL.
//
// Chat is STREAMED: the POST chat op returns newline-delimited JSON events
// (see the loop at the bottom) so the client paints tokens as they arrive. The
// same loop runs the model's tools — run_code, web_search, read_url, remember —
// feeding each result back until it answers.
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

// A short, unambiguous room code (no 0/O/1/I/L).
function roomCode(): string {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((n) => a[n % a.length]).join("");
}

// ---- tools --------------------------------------------------------------------
// code execution: Wandbox's public sandbox — isolated and ephemeral, never on
// our Worker or the viewer's machine. We only proxy code → Wandbox → output.
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

// web look-up (keyless): read a URL, or run a search — DuckDuckGo lite fetched
// through r.jina.ai, which returns clean result text (titles, links, snippets).
async function readUrl(u: string): Promise<string> {
  try {
    const r = await fetch(`https://r.jina.ai/${u}`, { headers: { accept: "text/plain" }, signal: AbortSignal.timeout(22_000) });
    if (r.ok) return (await r.text()).slice(0, 8000);
    return `(couldn't read ${u} — ${r.status})`;
  } catch { return `(couldn't reach ${u})`; }
}
async function webSearch(q: string): Promise<string> {
  const query = String(q ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!query) return "(empty query)";
  try {
    const r = await fetch(`https://r.jina.ai/https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, { headers: { accept: "text/plain" }, signal: AbortSignal.timeout(25_000) });
    if (r.ok) { const t = (await r.text()).trim(); return t ? t.slice(0, 9000) : "(no results)"; }
    return `(search failed — ${r.status})`;
  } catch { return "(search failed)"; }
}

// Non-streaming tool loop, used by co-work rooms (the reply is stored, not
// streamed — everyone in the room picks it up by polling).
async function runLoop(cfg: ReturnType<typeof endpoints>, model: string, messages: any[], tools: any[]): Promise<{ content: string; steps: any[] }> {
  const convo = [...messages];
  const steps: any[] = [];
  for (let it = 0; it < 6; it++) {
    let rr: Response;
    try {
      rr = await fetch(cfg.chat, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", ...cfg.headers }, body: JSON.stringify({ model, messages: convo, tools: tools.length ? tools : undefined, stream: false }), signal: AbortSignal.timeout(90_000) });
    } catch {
      return { content: "⚠ the ai didn't answer — try again", steps };
    }
    const d: any = await rr.json().catch(() => null);
    const c = d?.choices?.[0];
    if (!rr.ok || !c) return { content: "⚠ " + (d?.error?.message || "the ai couldn't answer that"), steps };
    const tcs = c.message?.tool_calls;
    if (c.finish_reason === "tool_calls" && Array.isArray(tcs) && tcs.length) {
      convo.push(c.message);
      for (const tc of tcs) {
        let a: any = {};
        try { a = JSON.parse(tc.function?.arguments || "{}"); } catch { /* bad args */ }
        let out = "";
        if (tc.function?.name === "run_code") { out = await runCode(a.language, a.code); steps.push({ id: tc.id, name: "run_code", language: a.language, code: a.code, output: out, status: "done" }); }
        else if (tc.function?.name === "web_search") { out = await webSearch(a.query); steps.push({ id: tc.id, name: "web_search", query: a.query, output: out, status: "done" }); }
        else if (tc.function?.name === "read_url") { out = await readUrl(a.url); steps.push({ id: tc.id, name: "read_url", url: a.url, output: out, status: "done" }); }
        else out = `unknown tool ${tc.function?.name}`;
        convo.push({ role: "tool", tool_call_id: tc.id, content: out });
      }
      continue;
    }
    return { content: pickContent(c.message) || "(done)", steps };
  }
  return { content: "(stopped after several steps — ask me to continue)", steps };
}

// One plain completion (no tools, no streaming): the humanizer's rewrite call.
async function completeText(cfg: ReturnType<typeof endpoints>, model: string, system: string, user: string): Promise<{ text: string; error?: string }> {
  try {
    const rr = await fetch(cfg.chat, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...cfg.headers },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.9, stream: false }),
      signal: AbortSignal.timeout(80_000),
    });
    const d: any = await rr.json().catch(() => null);
    if (!rr.ok) return { text: "", error: d?.error?.message || "the ai couldn't do that" };
    const text = pickContent(d?.choices?.[0]?.message).trim();
    return text ? { text } : { text: "", error: "the ai returned nothing" };
  } catch {
    return { text: "", error: "the ai didn't answer, try again" };
  }
}

const RUN_TOOL = {
  type: "function",
  function: {
    name: "run_code",
    description: "Execute code in an isolated sandbox and get its output (stdout/stderr). Use it for calculations, data work, testing snippets, anything better answered by running code. Supported: python, javascript, typescript, c, c++, go, ruby, php, bash, rust, java, c#.",
    parameters: { type: "object", properties: { language: { type: "string", description: "e.g. python, javascript, go" }, code: { type: "string", description: "a complete program that prints its result" } }, required: ["language", "code"] },
  },
};
const SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the live web and get result titles, links and snippets. Use it for anything current, factual, or beyond your training. You can call it several times to refine, then read_url the best links.",
    parameters: { type: "object", properties: { query: { type: "string", description: "the search query" } }, required: ["query"] },
  },
};
const READ_TOOL = {
  type: "function",
  function: {
    name: "read_url",
    description: "Fetch a web page and get its readable text. Use it to read a search result or a link the user pasted.",
    parameters: { type: "object", properties: { url: { type: "string", description: "the full https URL to read" } }, required: ["url"] },
  },
};
const REMEMBER_TOOL = {
  type: "function",
  function: {
    name: "remember",
    description: "Save a durable fact about the user or their preferences to long-term memory, so you keep it in every future chat. Use it sparingly, only when the user shares something clearly worth remembering (their name, how they like answers, an ongoing project). Don't remember secrets or one-off trivia.",
    parameters: { type: "object", properties: { fact: { type: "string", description: "a short first-person-about-the-user fact, e.g. 'prefers concise answers with worked steps'" } }, required: ["fact"] },
  },
};

// Append a fact to the member's persistent memory (deduped, capped).
async function remember(userId: string, current: string | null, fact: string): Promise<string | null> {
  const f = String(fact ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (!f) return null;
  const base = (current ?? "").trim();
  if (base.toLowerCase().includes(f.toLowerCase())) return null; // already known
  const header = /(^|\n)## remembered\b/i.test(base) ? "" : (base ? "\n\n" : "") + "## remembered";
  const next = (base + header + `\n- ${f}`).slice(0, 20_000);
  await run("update users set shh_instructions = ? where id = ?", next, userId).catch(() => {});
  return f;
}

// ---- history budgeting --------------------------------------------------------
// A single giant paste (or a runaway conversation) used to overflow the upstream
// request limit and come back "Invalid API parameter" — the whole turn just
// failed. We now (1) clamp any one oversized message and (2) keep the most recent
// turns under a character budget, dropping older ones behind a marker. Leading
// system messages (the setup/memory preamble) are always kept.
const PER_MSG = 120_000;
const HISTORY_BUDGET = 480_000;

function clampText(s: string, max = PER_MSG): string {
  return s.length > max ? s.slice(0, max) + `\n\n[…truncated ${s.length - max} characters to fit…]` : s;
}
function msgSize(m: any): number {
  const c = m?.content;
  if (typeof c === "string") return c.length;
  if (Array.isArray(c)) return c.reduce((n: number, p: any) => n + (p?.text?.length || 0) + (p?.image_url?.url?.length || 0), 0);
  return 0;
}
function clampMsg(m: any): any {
  const c = m?.content;
  if (typeof c === "string") return { ...m, content: clampText(c) };
  if (Array.isArray(c)) {
    let imgs = 0;
    const parts = c
      .map((p: any) => (p?.type === "text" ? { ...p, text: clampText(String(p.text ?? "")) } : p))
      .filter((p: any) => (p?.type === "image_url" ? ++imgs <= 8 : true)); // cap images/turn
    return { ...m, content: parts };
  }
  return m;
}
function budgetHistory(messages: any[]): any[] {
  const lead: any[] = [];
  let i = 0;
  while (i < messages.length && messages[i]?.role === "system") lead.push(messages[i++]);
  const rest = messages.slice(i).map(clampMsg);
  const kept: any[] = [];
  let used = lead.reduce((n, m) => n + msgSize(m), 0);
  let dropped = 0;
  for (let j = rest.length - 1; j >= 0; j--) {
    const sz = msgSize(rest[j]);
    if (used + sz > HISTORY_BUDGET && kept.length) { dropped = j + 1; break; }
    kept.unshift(rest[j]);
    used += sz;
  }
  if (dropped > 0) lead.push({ role: "system", content: `[${dropped} earlier message(s) were trimmed to keep this within limits. Ask the user to repeat anything you need.]` });
  return [...lead, ...kept];
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
  if (cfg.model && !models.some((m) => m.id === cfg.model)) models.unshift({ id: cfg.model, label: cfg.model, vision: looksVision(cfg.model) });
  const docs = await all<{ id: string; name: string }>("select id, name from shh_docs where user_id = ? order by created_at", me.id).catch(() => []);
  return Response.json({ models, default: cfg.model, instructions: me.shh_instructions ?? "", docs }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const e = await readEnv();
  const b = (await req.json().catch(() => ({}))) as { op?: string; code?: string; model?: string; messages?: any[]; web?: boolean; exec?: boolean; instructions?: string; name?: string; content?: string; id?: string; title?: string; after?: number; text?: string; images?: string[]; strength?: string; tone?: string; sample?: string; humanize?: boolean };
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

  // ---- co-work rooms: a shared session several members work in at once ----
  const touchMember = (room: string) =>
    run("insert into shh_room_members (room_id, user_id, handle, last_seen) values (?, ?, ?, unixepoch()) on conflict(room_id, user_id) do update set last_seen = unixepoch(), handle = excluded.handle", room, me.id, me.handle).catch(() => {});

  if (b.op === "room_create") {
    const id = roomCode();
    const title = (String(b.title ?? "").trim() || "project").slice(0, 80);
    await run("insert into shh_rooms (id, owner_id, title) values (?, ?, ?)", id, me.id, title);
    await touchMember(id);
    return Response.json({ id, title });
  }
  if (b.op === "room_join") {
    const id = String(b.id ?? "").trim().toUpperCase();
    const room = await first<{ id: string; title: string }>("select id, title from shh_rooms where id = ?", id);
    if (!room) return Response.json({ error: "no room with that code" }, { status: 404 });
    await touchMember(id);
    return Response.json({ id: room.id, title: room.title });
  }
  if (b.op === "room_poll") {
    const id = String(b.id ?? "").trim().toUpperCase();
    await touchMember(id);
    const after = Number(b.after) || 0;
    const rows = await all<{ id: number; handle: string | null; role: string; content: string; steps: string | null }>(
      "select id, handle, role, content, steps from shh_room_msgs where room_id = ? and id > ? order by id limit 300", id, after,
    ).catch(() => []);
    const members = await all<{ handle: string }>("select handle from shh_room_members where room_id = ? and last_seen > unixepoch() - 40 order by last_seen desc", id).catch(() => []);
    return Response.json({
      messages: rows.map((m) => ({ id: m.id, handle: m.handle, role: m.role, content: m.content, steps: m.steps ? JSON.parse(m.steps) : undefined })),
      members: members.map((x) => x.handle).filter(Boolean),
    }, { headers: { "cache-control": "no-store" } });
  }
  if (b.op === "room_send") {
    const id = String(b.id ?? "").trim().toUpperCase();
    const room = await first<{ id: string; owner_id: string }>("select id, owner_id from shh_rooms where id = ?", id);
    if (!room) return Response.json({ error: "that room is gone" }, { status: 404 });
    await touchMember(id);
    const text = String(b.text ?? "").slice(0, 120_000);
    const images = Array.isArray(b.images) ? b.images.slice(0, 6) : [];
    if (!text.trim() && !images.length) return Response.json({ error: "nothing to send" }, { status: 400 });
    // store the member's turn (image bytes aren't persisted — just a marker)
    await run("insert into shh_room_msgs (room_id, user_id, handle, role, content) values (?, ?, ?, 'user', ?)", id, me.id, me.handle, text + (images.length ? `\n[${images.length} image(s) attached]` : ""));

    // assemble the shared transcript + the room owner's instructions/files as project context
    const cfg = endpoints(e);
    const preamble: any[] = [];
    const owner = await first<{ shh_instructions: string | null }>("select shh_instructions from users where id = ?", room.owner_id).catch(() => null);
    const refParts: string[] = [];
    if (owner?.shh_instructions?.trim()) refParts.push("PROJECT INSTRUCTIONS / MEMORY:\n" + owner.shh_instructions.trim());
    const refDocs = await all<{ name: string; content: string }>("select name, content from shh_docs where user_id = ? order by created_at", room.owner_id).catch(() => []);
    let bud = 150_000;
    for (const d of refDocs) { const blk = `--- project file: ${d.name} ---\n${d.content}`; if (blk.length > bud) { if (bud > 2000) refParts.push(blk.slice(0, bud)); break; } refParts.push(blk); bud -= blk.length; }
    preamble.push({ role: "system", content: "You are the shared assistant in a co-work room where several people collaborate on a project with you. Each user message is prefixed with who sent it. Keep a running draft, answer clearly, and build on what either person asks. " + (refParts.length ? "Project context:\n\n" + refParts.join("\n\n") : "") });
    const tools: any[] = [];
    if (b.exec) tools.push(RUN_TOOL);
    if (b.web) tools.push(SEARCH_TOOL, READ_TOOL);

    const rows = await all<{ handle: string | null; role: string; content: string }>("select handle, role, content from shh_room_msgs where room_id = ? order by id desc limit 50", id).catch(() => []);
    rows.reverse();
    const convo: any[] = rows.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.role === "assistant" ? m.content : `${m.handle || "someone"}: ${m.content}` }));
    // attach this send's images to the final user turn
    if (images.length && convo.length) {
      const lastText = typeof convo[convo.length - 1].content === "string" ? convo[convo.length - 1].content : "";
      convo[convo.length - 1] = { role: "user", content: [{ type: "text", text: lastText }, ...images.map((u) => ({ type: "image_url", image_url: { url: u } }))] };
    }
    const messages = budgetHistory([...preamble, ...convo]);
    const { content, steps } = await runLoop(cfg, b.model || cfg.model, messages, tools);
    await run("insert into shh_room_msgs (room_id, role, content, steps) values (?, 'assistant', ?, ?)", id, content, steps.length ? JSON.stringify(steps) : null);
    return Response.json({ ok: true });
  }

  // ---- humanize: rewrite text so it reads like a person wrote it ----------------
  // Chunked, so long text keeps its quality and doesn't get cut off. Every chunk is
  // checked: if the rewrite dropped or changed a number, link or code block we ask
  // once more, and if it still can't keep them we keep the ORIGINAL wording for that
  // chunk (lightly cleaned) and say so, rather than hand back text with wrong facts.
  if (b.op === "humanize") {
    const text = String(b.text ?? "").slice(0, 40_000);
    if (!text.trim()) return Response.json({ error: "paste some text first" }, { status: 400 });
    const strength = (STRENGTHS as string[]).includes(String(b.strength)) ? (b.strength as Strength) : "medium";
    const tone = (TONES as string[]).includes(String(b.tone)) ? (b.tone as Tone) : "neutral";
    const cfg = endpoints(e);
    const model = b.model || cfg.model;
    const r = await humanizeText(text, { strength, tone, sample: b.sample }, (system, user) => completeText(cfg, model, system, user));
    if (r.error) return Response.json({ error: r.error }, { status: 502 });
    return Response.json({ text: r.text, warnings: r.warnings }, { headers: { "cache-control": "no-store" } });
  }

  if (b.op === "chat") {
    let messages = Array.isArray(b.messages) ? b.messages : [];
    if (!messages.length) return Response.json({ error: "nothing to send" }, { status: 400 });
    const cfg = endpoints(e);

    // Persistent setup preamble: instructions/memory + reference files.
    const preamble: any[] = [];
    const refParts: string[] = [];
    let memory = me.shh_instructions ?? "";
    if (memory && memory.trim()) refParts.push("INSTRUCTIONS / MEMORY:\n" + memory.trim());
    const refDocs = await all<{ name: string; content: string }>("select name, content from shh_docs where user_id = ? order by created_at", me.id).catch(() => []);
    let budget = 180_000;
    for (const d of refDocs) {
      const block = `--- reference file: ${d.name} ---\n${d.content}`;
      if (block.length > budget) { if (budget > 2000) refParts.push(block.slice(0, budget)); break; }
      refParts.push(block);
      budget -= block.length;
    }
    if (refParts.length) preamble.push({ role: "system", content: "The user set up this persistent context for you — always use it:\n\n" + refParts.join("\n\n") });

    // Which tools are on this turn. remember is always available.
    const tools: any[] = [];
    if (b.exec) tools.push(RUN_TOOL);
    if (b.web) tools.push(SEARCH_TOOL, READ_TOOL);
    tools.push(REMEMBER_TOOL);
    const hints: string[] = [];
    if (b.web) hints.push("You have live web access via web_search and read_url — use them for anything current or factual and cite what you rely on.");
    if (b.exec) hints.push("You can run code via run_code for calculations and data work.");
    hints.push("You can save durable facts about the user with remember.");
    if (b.humanize) hints.push(buildStyleGuide((TONES as string[]).includes(String(b.tone)) ? (b.tone as Tone) : "neutral"));
    preamble.push({ role: "system", content: hints.join(" ") });

    messages = budgetHistory([...preamble, ...messages]);

    const model = b.model || cfg.model;
    const enc = new TextEncoder();
    let abort: AbortController | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (ev: Record<string, unknown>) => {
          try { controller.enqueue(enc.encode(JSON.stringify(ev) + "\n")); } catch { /* closed */ }
        };
        const convo = [...messages];
        try {
          for (let it = 0; it < 8; it++) {
            abort = new AbortController();
            let rr: Response;
            try {
              rr = await fetch(cfg.chat, {
                method: "POST",
                headers: { "content-type": "application/json", accept: "text/event-stream", ...cfg.headers },
                body: JSON.stringify({ model, messages: convo, tools: tools.length ? tools : undefined, stream: true }),
                signal: abort.signal,
              });
            } catch {
              emit({ k: "err", v: "the ai didn't answer — try again" });
              break;
            }
            if (!rr.ok || !rr.body) {
              let msg = "the ai couldn't answer that";
              try { const j: any = await rr.json(); msg = j?.error?.message || msg; } catch { /* non-json */ }
              emit({ k: "err", v: msg });
              break;
            }

            // Parse the upstream SSE: accumulate visible content + any tool calls.
            let content = "";
            const toolAcc = new Map<number, { id: string; name: string; args: string }>();
            let finish: string | null = null;
            const reader = rr.body.getReader();
            const dec = new TextDecoder();
            let buf = "";
            readLoop: for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              let nl: number;
              while ((nl = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (!line.startsWith("data:")) continue;
                const payload = line.slice(5).trim();
                if (payload === "[DONE]") break readLoop;
                let j: any = null;
                try { j = JSON.parse(payload); } catch { continue; }
                const ch = j?.choices?.[0];
                if (!ch) continue;
                const delta = ch.delta || {};
                if (typeof delta.content === "string" && delta.content) { content += delta.content; emit({ k: "d", v: delta.content }); }
                if (Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    const cur = toolAcc.get(idx) || { id: "", name: "", args: "" };
                    if (tc.id) cur.id = tc.id;
                    if (tc.function?.name) cur.name = tc.function.name;
                    if (tc.function?.arguments) cur.args += tc.function.arguments;
                    toolAcc.set(idx, cur);
                  }
                }
                if (ch.finish_reason) finish = ch.finish_reason;
              }
            }

            // Tool calls → run them, feed outputs back, loop again.
            if (toolAcc.size > 0 && finish !== "stop") {
              const toolCalls = [...toolAcc.values()].filter((t) => t.name).map((t) => ({ id: t.id || crypto.randomUUID(), type: "function", function: { name: t.name, arguments: t.args || "{}" } }));
              convo.push({ role: "assistant", content, tool_calls: toolCalls });
              for (const tc of toolCalls) {
                let args: any = {};
                try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* bad args */ }
                let output = "";
                if (tc.function.name === "run_code") {
                  emit({ k: "tool", id: tc.id, name: "run_code", language: String(args.language ?? ""), code: String(args.code ?? ""), status: "running" });
                  output = await runCode(args.language, args.code);
                } else if (tc.function.name === "web_search") {
                  emit({ k: "tool", id: tc.id, name: "web_search", query: String(args.query ?? ""), status: "running" });
                  output = await webSearch(args.query);
                } else if (tc.function.name === "read_url") {
                  emit({ k: "tool", id: tc.id, name: "read_url", url: String(args.url ?? ""), status: "running" });
                  output = await readUrl(args.url);
                } else if (tc.function.name === "remember") {
                  const saved = await remember(me.id, memory, args.fact);
                  if (saved) { memory = (memory ? memory + "\n- " : "- ") + saved; emit({ k: "mem", v: saved }); }
                  output = saved ? "saved to memory" : "already known / skipped";
                } else {
                  output = `unknown tool ${tc.function.name}`;
                }
                emit({ k: "tool", id: tc.id, status: "done", output });
                convo.push({ role: "tool", tool_call_id: tc.id, content: output });
              }
              continue;
            }

            if (!content.trim()) emit({ k: "err", v: "the ai returned nothing — try again" });
            break;
          }
        } catch {
          emit({ k: "err", v: "the ai stopped unexpectedly" });
        }
        emit({ k: "end" });
        try { controller.close(); } catch { /* already closed */ }
      },
      cancel() { try { abort?.abort(); } catch { /* */ } },
    });

    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  }

  return Response.json({ error: "unknown op" }, { status: 400 });
}
