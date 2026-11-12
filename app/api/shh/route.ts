import { getCloudflareContext } from "@opennextjs/cloudflare";
import { memberOr401 } from "@/lib/auth";
import { all, background, first, run } from "@/lib/db";
import { STRENGTHS, TONES, buildStyleGuide, humanizeText, type Strength, type Tone } from "@/lib/humanize";
import { ocrNoteFor, readImagesWithOcr } from "@/lib/ocr";
import { ThinkFilter, candidatesFor, chatWithFailover, cleanErr, markDown, modelFault, providersFor, readSSE, refreshModels, splitId, workingModels, type ModelRow, type Provider } from "@/lib/ai";
import { d1Store } from "@/lib/ai-store";
import { formatHits, htmlToText, isPublicHttpUrl, parseDuckLite } from "@/lib/web";

// The private AI corner (/shh). Members only, and gated by a code (SHH_CODE,
// default "SEMINOLE") that the client sends with every call — so the AI endpoint
// isn't open to anyone who merely has a session.
//
// Backend (lib/ai.ts): Inception Labs, keyed from INCEPTION_API_KEY.
// The model list is never taken on trust: models are PROBED with real requests and only
// the ones that recently answered are offered (see /api/shh GET). A request that hits a
// dead or stalled model fails over to a working one. Web search uses Exa when EXA_API_KEY
// is set, with DuckDuckGo as the fallback.
//
// Chat is STREAMED: the POST chat op returns newline-delimited JSON events
// (see the loop at the bottom) so the client paints tokens as they arrive. The
// same loop runs the model's tools — run_code, web_search, read_url, remember —
// feeding each result back until it answers.
/* eslint-disable @typescript-eslint/no-explicit-any */

async function readEnv(): Promise<Record<string, string | undefined>> {
  try {
    return (await getCloudflareContext({ async: true })).env as unknown as Record<string, string | undefined>;
  } catch {
    return process.env as Record<string, string | undefined>;
  }
}

const nowSec = () => Math.floor(Date.now() / 1000);

// Which models can serve this request right now, best first (the requested one if it
// is working, then its provider's others, then the other provider's).
async function modelsFor(e: Record<string, string | undefined>, requested?: string, opts: { vision?: boolean; tools?: boolean } = {}) {
  const providers = providersFor(e);
  const rows = await d1Store.rows().catch(() => [] as ModelRow[]);
  // only models from providers this deployment has keys for (old rows may linger)
  const live = new Set(providers.map((p) => p.id));
  const working = workingModels(rows, nowSec()).filter((r) => live.has(splitId(r.id)?.provider ?? ""));
  // A request with images goes to a model that can read them, when one is working; one
  // that asks for code execution goes to a model that can call tools. (If none can, the
  // best model answers anyway: it just can't do that part.)
  const pool = opts.vision && working.some((r) => r.vision === 1) ? working.filter((r) => r.vision === 1)
    : opts.tools && working.some((r) => r.tools === 1) ? working.filter((r) => r.tools === 1)
    : working;
  const byId = new Map(working.map((r) => [r.id, r]));
  return { providers, rows, working, byId, candidates: candidatesFor(pool, requested, 4) };
}
// A failure seen in real use: drop that model from the list right away.
const downReporter = () => (id: string, err: string) => { markDown(d1Store, id, err, nowSec()).catch(() => {}); };
// Kick off a lease-guarded refresh of model health without holding the response.
function kickRefresh(providers: Provider[], force = false) {
  background(refreshModels(fetch, providers, d1Store, { force, deadlineMs: 24_000 }));
}
// Images only reach models measured to read them; any other gets the text with a note
// (a 400 for an image it can't read would otherwise look like the model being down).
const hasImages = (msgs: any[]) => msgs.some((m) => Array.isArray(m?.content) && m.content.some((p: any) => p?.type === "image_url"));
function withoutImages(msgs: any[]): any[] {
  return msgs.map((m) => {
    if (!Array.isArray(m?.content)) return m;
    const text = m.content.filter((p: any) => p?.type === "text").map((p: any) => p?.text ?? "").join("\n");
    const imgs = m.content.filter((p: any) => p?.type === "image_url");
    if (!imgs.length) return { ...m, content: text };
    // a model that can't see still gets the words OCR read from the picture, when there were any
    const read = imgs.map((p: any, i: number) => { const t = ocrNoteFor(p); return t ? `[text read from attached image ${i + 1} by OCR:\n${t}\n]` : ""; }).filter(Boolean);
    const note = read.length
      ? read.join("\n") + "\n[the image itself can't be seen by this model, only its text was read; say so if the question needs the picture]"
      : "\n[an image was attached, but this model can't read images]";
    return { ...m, content: text + (read.length ? "\n" : "") + note };
  });
}
function lastUserText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) return m.content.filter((p: any) => p?.type === "text").map((p: any) => p?.text ?? "").join(" ");
  }
  return "";
}
// Web access for models that can't call tools (Hybra's Gemini models take a tools
// array and answer with nothing): read any links in the message, otherwise search,
// and hand the model the result as context.
async function webContext(query: string): Promise<any | null> {
  const urls = [...new Set(query.match(/https?:\/\/[^\s<>"')]+/g) || [])].slice(0, 3);
  const body = urls.length
    ? (await Promise.all(urls.map(async (u) => `SOURCE ${u}:\n${await readUrl(u)}`))).join("\n\n---\n\n")
    : await webSearch(query);
  return { role: "system", content: "You have live web access for this question. Freshly fetched web content is below; use it to answer and cite the sources (titles/URLs) you rely on.\n\n" + body.slice(0, 18_000) };
}
const FIRST_BYTE_MS = 20_000; // a model that hasn't started answering in this long is replaced
const STALL_MS = 20_000;     // ...and one that goes silent mid-answer for this long
const NO_MODELS = "no ai models are responding right now. i’m re-checking them; try again in a minute.";

const codeOf = (e: Record<string, string | undefined>) => e.SHH_CODE || "SEMINOLE";

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

// web look-up (keyless). Direct fetches come first: they have no middleman to be
// blocked (r.jina.ai answers 401 "bad IP reputation" to some servers and 403 for any
// search page). Jina is only the second try.
const WEB_UA = "Mozilla/5.0 (compatible; cupcake.gg/1.0; +https://cupcake.gg)";
async function readUrl(u: string): Promise<string> {
  if (!isPublicHttpUrl(u)) return `(won't read ${u}: only public web pages)`;
  try {
    const r = await fetch(u, { headers: { "user-agent": WEB_UA, accept: "text/html,text/plain,*/*;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (r.ok) {
      const body = (await r.text()).slice(0, 600_000);
      const text = /html|xml/i.test(r.headers.get("content-type") || "") ? htmlToText(body) : body.trim();
      if (text.trim().length > 40) return text.slice(0, 8000);
    }
  } catch { /* fall through to the reader proxy */ }
  try {
    const r = await fetch(`https://r.jina.ai/${u}`, { headers: { accept: "text/plain" }, signal: AbortSignal.timeout(20_000) });
    if (r.ok) { const t = (await r.text()).trim(); if (t) return t.slice(0, 8000); }
    return `(couldn't read ${u})`;
  } catch { return `(couldn't reach ${u})`; }
}
// Search for the model. Exa first (semantic search with the page highlights the
// model needs; the request shape follows the build-with-exa skill: query, type auto,
// highlights). Without an EXA_API_KEY, or if Exa fails, DuckDuckGo answers instead.
const EXA_DEFAULT_KEY = "df7214cc-e161-44e5-bcdc-6f1308bc0ad4";
async function exaSearch(query: string, key: string): Promise<string | null> {
  try {
    const r = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "x-api-key": key },
      body: JSON.stringify({ query, type: "auto", contents: { highlights: true } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    const d: any = await r.json();
    const hits = (d?.results ?? []).slice(0, 8).map((x: any, i: number) => {
      const hl = (Array.isArray(x.highlights) ? x.highlights : []).map((h: string) => String(h).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 3);
      const date = x.publishedDate ? ` (${String(x.publishedDate).slice(0, 10)})` : "";
      return `${i + 1}. ${x.title || x.url}${date}\n   ${x.url}${hl.length ? "\n   " + hl.join(" … ") : ""}`;
    });
    return hits.length ? "WEB SEARCH RESULTS (Exa):\n" + hits.join("\n\n") : null;
  } catch { return null; }
}

async function webSearch(q: string): Promise<string> {
  const query = String(q ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!query) return "(empty query)";
  // EXA_API_KEY from the environment overrides this default (a key the owner chose to hardcode).
  const exaKey = ((await readEnv()).EXA_API_KEY ?? "").trim() || EXA_DEFAULT_KEY;
  if (exaKey) { const hit = await exaSearch(query, exaKey); if (hit) return hit; }
  try {
    const r = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36", accept: "text/html" }, signal: AbortSignal.timeout(15_000) });
    if (r.ok) { const hits = parseDuckLite(await r.text()); if (hits.length) return "WEB SEARCH RESULTS (DuckDuckGo):\n" + formatHits(hits); }
  } catch { /* fall through to the reader proxy */ }
  try {
    const r = await fetch(`https://r.jina.ai/https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, { headers: { accept: "text/plain" }, signal: AbortSignal.timeout(20_000) });
    if (r.ok) { const t = (await r.text()).trim(); if (t) return t.slice(0, 9000); }
  } catch { /* nothing left to try */ }
  return "(search failed)";
}

// Tool loop for co-work rooms (the reply is stored, not streamed — everyone in the
// room picks it up by polling). Streams from the provider and aggregates, because
// that is the only mode every backend answers in. Fails over between models on the
// first call; once one answers it is kept for the rest of the loop.
type Down = (id: string, err: string) => void;
async function runLoop(providers: Provider[], byId: Map<string, ModelRow>, candidates: string[], messages: any[], tools: any[], onDown: Down, webMsg: any | null): Promise<{ content: string; steps: any[]; model: string | null }> {
  const convo = [...messages];
  const steps: any[] = [];
  let pin = candidates, model: string | null = null;
  for (let it = 0; it < 6; it++) {
    // each candidate gets only what it supports (see the chat op)
    const r = await chatWithFailover(fetch, providers, pin, (ns) => {
      const row = byId.get(ns);
      const useTools = tools.length > 0 && row?.tools === 1;
      return { messages: [...(!useTools && webMsg ? [webMsg] : []), ...(hasImages(convo) && row?.vision !== 1 ? withoutImages(convo) : convo)], tools: useTools ? tools : undefined };
    }, { timeoutMs: 90_000, onDown });
    if (!r.model) return { content: "⚠ " + (r.reply.err || "the ai couldn't answer that"), steps, model };
    model = r.model; pin = [r.model];
    const { reply } = r;
    if (reply.toolCalls.length && reply.finish !== "stop") {
      const toolCalls = reply.toolCalls.map((t) => ({ id: t.id || crypto.randomUUID(), type: "function", function: { name: t.name, arguments: t.args || "{}" } }));
      convo.push({ role: "assistant", content: reply.content, tool_calls: toolCalls });
      for (const tc of toolCalls) {
        let a: any = {};
        try { a = JSON.parse(tc.function.arguments || "{}"); } catch { /* bad args */ }
        let out = "";
        if (tc.function.name === "run_code") { out = await runCode(a.language, a.code); steps.push({ id: tc.id, name: "run_code", language: a.language, code: a.code, output: out, status: "done" }); }
        else if (tc.function.name === "web_search") { out = await webSearch(a.query); steps.push({ id: tc.id, name: "web_search", query: a.query, output: out, status: "done" }); }
        else if (tc.function.name === "read_url") { out = await readUrl(a.url); steps.push({ id: tc.id, name: "read_url", url: a.url, output: out, status: "done" }); }
        else out = `unknown tool ${tc.function.name}`;
        convo.push({ role: "tool", tool_call_id: tc.id, content: out });
      }
      continue;
    }
    return { content: reply.content || "(done)", steps, model };
  }
  return { content: "(stopped after several steps — ask me to continue)", steps, model };
}

// One plain completion (no tools): the humanizer's rewrite call, with failover.
async function completeText(providers: Provider[], candidates: string[], system: string, user: string, onDown: Down): Promise<{ text: string; error?: string }> {
  if (!candidates.length) return { text: "", error: NO_MODELS };
  const r = await chatWithFailover(fetch, providers, candidates, { messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.9 }, { timeoutMs: 80_000, onDown });
  if (!r.model) return { text: "", error: r.reply.err || "the ai couldn’t do that" };
  return r.reply.content ? { text: r.reply.content } : { text: "", error: "the ai returned nothing" };
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

// What the picker shows: ONLY models whose last live probe passed (never the
// provider's raw list), with vision / tool support as measured, not guessed.
async function modelsPayload(e: Record<string, string | undefined>) {
  const { rows, working } = await modelsFor(e);
  const now = nowSec();
  const real = rows.filter((r) => r.id !== "__lock");
  const lock = rows.find((r) => r.id === "__lock");
  return {
    models: working.map((m) => ({ id: m.id, provider: splitId(m.id)?.provider ?? "", label: splitId(m.id)?.id ?? m.id, vision: m.vision === 1, tools: m.tools === 1, ms: m.ms })),
    default: working[0]?.id ?? null,
    // nothing to offer yet AND still working it out (first run, or a refresh in flight)
    checking: working.length === 0 && (real.length < 3 || (lock?.checked_at ?? 0) > now - 45),
    checkedAt: real.reduce((m, r) => Math.max(m, r.checked_at), 0),
  };
}

export async function GET(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const e = await readEnv();
  if ((new URL(req.url).searchParams.get("code") || "") !== codeOf(e)) return Response.json({ error: "locked" }, { status: 403 });
  kickRefresh(providersFor(e)); // lease-guarded: at most one refresh runs, and it only probes what's stale
  const docs = await all<{ id: string; name: string }>("select id, name from shh_docs where user_id = ? order by created_at", me.id).catch(() => []);
  return Response.json({ ...(await modelsPayload(e)), instructions: me.shh_instructions ?? "", docs }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const e = await readEnv();
  const b = (await req.json().catch(() => ({}))) as { op?: string; code?: string; model?: string; messages?: any[]; web?: boolean; exec?: boolean; instructions?: string; name?: string; content?: string; id?: string; title?: string; after?: number; text?: string; images?: string[]; strength?: string; tone?: string; sample?: string; humanize?: boolean };
  if ((b.code || "") !== codeOf(e)) return Response.json({ error: "wrong code" }, { status: 403 });

  if (b.op === "unlock") return Response.json({ ok: true });

  // "re-check": probe everything stale (or, with force, everything) right now.
  if (b.op === "models_refresh") {
    await refreshModels(fetch, providersFor(e), d1Store, { force: !!(b as { force?: boolean }).force, deadlineMs: 22_000, leaseSec: 0 });
    return Response.json(await modelsPayload(e), { headers: { "cache-control": "no-store" } });
  }

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
    const { providers, byId, candidates } = await modelsFor(e, b.model, { vision: images.length > 0, tools: !!b.exec });
    if (!candidates.length) { kickRefresh(providers); return Response.json({ error: NO_MODELS }, { status: 503 }); }
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
    const webMsg = b.web && candidates.some((c) => byId.get(c)?.tools !== 1) ? await webContext(lastUserText(messages)).catch(() => null) : null;
    if (hasImages(messages) && candidates.some((c) => byId.get(c)?.vision !== 1)) await readImagesWithOcr(fetch, messages);
    const { content, steps } = await runLoop(providers, byId, candidates, messages, tools, downReporter(), webMsg);
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
    const { providers, candidates } = await modelsFor(e, b.model);
    if (!candidates.length) { kickRefresh(providers); return Response.json({ error: NO_MODELS }, { status: 503 }); }
    const down = downReporter();
    const r = await humanizeText(text, { strength, tone, sample: b.sample }, (system, user) => completeText(providers, candidates, system, user, down));
    if (r.error) return Response.json({ error: r.error }, { status: 502 });
    return Response.json({ text: r.text, warnings: r.warnings }, { headers: { "cache-control": "no-store" } });
  }

  if (b.op === "chat") {
    let messages = Array.isArray(b.messages) ? b.messages : [];
    if (!messages.length) return Response.json({ error: "nothing to send" }, { status: 400 });
    const { providers, byId, candidates } = await modelsFor(e, b.model, { vision: hasImages(messages), tools: !!b.exec });
    if (!candidates.length) { kickRefresh(providers); return Response.json({ error: NO_MODELS }, { status: 503 }); }
    const down = downReporter();

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
    // What the model is told about its tools. Sent only to a model measured to support
    // them; a model without tool support must not be promised tools it can't call.
    const toolHints: string[] = [];
    if (b.web) toolHints.push("You have live web access via web_search and read_url — use them for anything current or factual and cite what you rely on.");
    if (b.exec) toolHints.push("You can run code via run_code for calculations and data work.");
    toolHints.push("You can save durable facts about the user with remember.");
    const toolHintMsg = { role: "system", content: toolHints.join(" ") };
    if (b.humanize) preamble.push({ role: "system", content: buildStyleGuide((TONES as string[]).includes(String(b.tone)) ? (b.tone as Tone) : "neutral") });

    messages = budgetHistory([...preamble, ...messages]);
    // Web for models that can't call tools: fetch it ourselves, once, up front.
    const webMsg = b.web && candidates.some((c) => byId.get(c)?.tools !== 1) ? await webContext(lastUserText(messages)).catch(() => null) : null;
    // some candidate can't see images (or none can): read the picture's text for it with OCR
    if (hasImages(messages) && candidates.some((c) => byId.get(c)?.vision !== 1)) await readImagesWithOcr(fetch, messages);

    const enc = new TextEncoder();
    let abort: AbortController | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (ev: Record<string, unknown>) => {
          try { controller.enqueue(enc.encode(JSON.stringify(ev) + "\n")); } catch { /* closed */ }
        };
        const convo = [...messages];
        let pinned = candidates;          // models to try; narrows to the one that answered
        let usedModel: string | null = null;
        let afterTools = false, nudged = false; // a model that goes silent right after using a tool gets ONE nudge before we blame it
        try {
          for (let it = 0; it < 8; it++) {
            // Try the candidate models in order. One that errors, or answers with
            // nothing at all, is reported down and the next is tried. That is invisible
            // to the client because we only fail over before anything was emitted.
            let content = "";
            let finish: string | null = null;
            const toolAcc = new Map<number, { id: string; name: string; args: string }>();
            let answered = false, stopped = false, lastErr = "";
            for (const ns of pinned) {
              const sp = splitId(ns);
              const prov = sp && providers.find((x) => x.id === sp.provider);
              if (!sp || !prov) continue;
              const ac = new AbortController(); abort = ac;
              // A model that stops responding is replaced, not waited on: 15s to the
              // first byte, then 20s of silence between chunks. (Stop is separate.)
              let stalled = false, idle: ReturnType<typeof setTimeout> | undefined;
              const arm = (ms: number) => { clearTimeout(idle); idle = setTimeout(() => { stalled = true; ac.abort(); }, ms); };
              arm(FIRST_BYTE_MS);
              // This model gets only what it supports: tools if it can call them (else
              // the web context fetched above), and images only if it can read them.
              const row = byId.get(ns);
              const useTools = tools.length > 0 && row?.tools === 1;
              const sendMsgs = [...(useTools ? [toolHintMsg] : webMsg ? [webMsg] : []), ...(hasImages(convo) && row?.vision !== 1 ? withoutImages(convo) : convo)];
              let rr: Response;
              try {
                rr = await fetch(`${prov.base}/chat/completions`, {
                  method: "POST",
                  // a keyless provider gets no Authorization header at all: AI Horde answers an empty "Bearer " with a 401 (OVH and Kilo ignore it)
                  headers: { "content-type": "application/json", accept: "text/event-stream", ...(prov.key ? { authorization: `Bearer ${prov.key}` } : {}) },
                  body: JSON.stringify({ model: sp.id, messages: sendMsgs, tools: useTools ? tools : undefined, stream: true }),
                  signal: ac.signal,
                });
              } catch {
                clearTimeout(idle);
                if (stalled) { lastErr = "no answer in time"; down(ns, lastErr); continue; }
                if (ac.signal.aborted) { stopped = true; break; }
                lastErr = "the ai didn’t answer"; down(ns, lastErr); continue;
              }
              if (!rr.ok || !rr.body) {
                clearTimeout(idle);
                let msg: any = "the ai couldn’t answer that";
                try { const j: any = await rr.json(); msg = j?.error?.message || msg; } catch { /* non-json */ }
                lastErr = cleanErr(String(msg)); if (modelFault(rr.status)) down(ns, lastErr); continue; // a 4xx is this request's fault, not the model's
              }

              // Stream it. Reasoning some models put inside `content` as <think> is hidden.
              const filter = new ThinkFilter();
              let emitted = false;
              content = ""; finish = null; toolAcc.clear();
              try {
                for await (const j of readSSE(rr)) {
                  arm(STALL_MS);
                  const ch = j?.choices?.[0];
                  if (!ch) continue;
                  const delta = ch.delta || {};
                  if (typeof delta.content === "string" && delta.content) {
                    let v = filter.push(delta.content);
                    if (!emitted) v = v.replace(/^\s+/, ""); // some models stream blank lines before the answer
                    if (v) { content += v; emitted = true; emit({ k: "d", v }); }
                  }
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
              } catch {
                clearTimeout(idle);
                if (stalled && !emitted && toolAcc.size === 0) { lastErr = "no answer in time"; down(ns, lastErr); continue; }
                if (stalled) { /* went quiet mid-answer: keep what already reached the client */ }
                else if (ac.signal.aborted) { stopped = true; break; }                     // the user pressed Stop
                else if (!emitted && toolAcc.size === 0) { lastErr = "the ai’s stream broke"; down(ns, lastErr); continue; }
              }
              clearTimeout(idle);
              const tail = emitted ? filter.flush() : filter.flush().replace(/^\s+/, "");
              if (tail) { content += tail; emitted = true; emit({ k: "d", v: tail }); }
              if (!emitted && toolAcc.size === 0) { lastErr = "the ai returned nothing"; if (!afterTools) down(ns, lastErr); continue; } // an empty 200: next model
              answered = true;
              if (ns !== usedModel) { emit({ k: "model", v: ns, wanted: candidates[0] !== ns ? candidates[0] : undefined }); usedModel = ns; }
              pinned = [ns];
              break;
            }
            if (stopped) break;
            if (!answered) {
              if (afterTools && !nudged) { nudged = true; convo.push({ role: "user", content: "(Using the tool results above, answer in plain text now.)" }); continue; }
              emit({ k: "err", v: lastErr || "the ai couldn’t answer that" }); break;
            }

            // Tool calls → run them, feed outputs back, loop again.
            if (toolAcc.size > 0 && finish !== "stop") {
              const toolCalls = [...toolAcc.values()].filter((t) => t.name).map((t) => ({ id: t.id || crypto.randomUUID(), type: "function", function: { name: t.name, arguments: t.args || "{}" } }));
              afterTools = true;
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
