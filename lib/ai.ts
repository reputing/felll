// The AI backends for /shh. Two OpenAI-compatible providers:
//   hybra  https://hybra.lol/docs: a free proxy over a rotating pool of upstreams.
//          The main provider. Its key is the public one printed in its own docs, so
//          it lives in code. Its upstreams go up and down all day.
//   dahl   https://inference.dahl.global: a paid account with three models. The key
//          is a secret (DAHL_API_KEY); this repo is public, so it is never in code,
//          and the provider is simply absent until the secret is set.
//
// Because the pool flakes, the model list is never taken on trust: every model is
// PROBED with a real request, and only the ones that actually answered recently are
// offered. Everything here is pure (fetch and storage are injected) so it runs in
// the route and in tests alike.
//
// Everything is STREAMED, including probes and one-shot calls. Measured against
// Hybra: the Gemini models answer 3/3 when streamed and 0/3 when not, so a
// non-streaming probe would report a working model as dead.

type Env = Record<string, string | undefined>;
type F = typeof fetch;
/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- providers ------------------------------------------------------------------
export interface Provider { id: string; label: string; base: string; key: string }

export const HYBRA_BASE = "https://hybra.lol/v1";
export const HYBRA_KEY = "femboysex"; // published in Hybra's own docs; shared and public by design
export const DAHL_BASE = "https://inference.dahl.global/v1";

/** Hybra always; Dahl only once its secret is set. Order = priority (main first). */
export function providersFor(env: Env): Provider[] {
  const out: Provider[] = [{ id: "hybra", label: "Hybra", base: (env.HYBRA_API_URL || HYBRA_BASE).replace(/\/+$/, ""), key: env.HYBRA_API_KEY || HYBRA_KEY }];
  if (env.DAHL_API_KEY) out.push({ id: "dahl", label: "Dahl", base: (env.DAHL_API_URL || DAHL_BASE).replace(/\/+$/, ""), key: env.DAHL_API_KEY });
  return out;
}

// A model is addressed as "provider:model-id" everywhere (client, DB, requests),
// so ids from different providers can never collide.
export const nsId = (provider: string, id: string) => `${provider}:${id}`;
export function splitId(v: string): { provider: string; id: string } | null {
  const i = v.indexOf(":");
  return i > 0 ? { provider: v.slice(0, i), id: v.slice(i + 1) } : null;
}
export const providerOf = (providers: Provider[], v: string) => { const s = splitId(v); return s ? providers.find((p) => p.id === s.provider) ?? null : null; };

// image/*, whisper, tts and embedding entries share the /models list but aren't chat.
export const isChatId = (id: string) => !/^image\//i.test(id) && !/whisper|tts|embed|rerank/i.test(id);

// ---- streaming ------------------------------------------------------------------
/** Parsed `data:` chunks of an SSE response, until [DONE] or the stream ends. */
export async function* readSSE(res: Response): AsyncGenerator<any> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try { yield JSON.parse(payload); } catch { /* keep-alive or a partial line */ }
    }
  }
}

/** Hides <think>…</think> reasoning that some models (MiniMax) put inside `content`.
 *  Stateful, so a tag split across stream chunks is still caught. */
export class ThinkFilter {
  private buf = "";
  private inThink = false;
  private justClosed = false;
  push(chunk: string): string {
    this.buf += chunk;
    let out = "";
    for (;;) {
      if (this.inThink) {
        const end = this.buf.indexOf("</think>");
        if (end >= 0) { this.buf = this.buf.slice(end + 8); this.inThink = false; this.justClosed = true; continue; }
        this.buf = this.buf.slice(Math.max(0, this.buf.length - 7)); // keep a possible partial "</think>"
        break;
      }
      const start = this.buf.indexOf("<think>");
      if (start >= 0) { out += this.take(this.buf.slice(0, start)); this.buf = this.buf.slice(start + 7); this.inThink = true; continue; }
      // emit everything except a trailing partial "<think>"
      let hold = 0;
      for (let k = Math.min(6, this.buf.length); k > 0; k--) if ("<think>".startsWith(this.buf.slice(this.buf.length - k))) { hold = k; break; }
      out += this.take(this.buf.slice(0, this.buf.length - hold));
      this.buf = this.buf.slice(this.buf.length - hold);
      break;
    }
    return out;
  }
  flush(): string { const r = this.inThink ? "" : this.take(this.buf); this.buf = ""; return r; }
  // after a closed think block, drop the blank lines the model leaves before its answer
  private take(s: string): string { if (!s) return s; if (this.justClosed) { s = s.replace(/^\s+/, ""); if (s) this.justClosed = false; } return s; }
}
export function stripThink(text: string): string { const f = new ThinkFilter(); return (f.push(text) + f.flush()).trim(); }

/** A failure that means the model is down or out of capacity (drop it from the list),
 *  as opposed to a 400/401/403/422 that means THIS request was wrong (an image the
 *  model can't read, a bad key). Dropping a model for the second kind would empty
 *  the list over one bad request. */
export const modelFault = (status: number) => status === 0 || status === 404 || status === 429 || status >= 500;

export interface Reply {
  status: number; ms: number;
  content: string;            // what the user should see (think blocks removed)
  raw: string;                // content as sent
  reasoning: string;          // separate reasoning stream (reasoning / reasoning_content)
  toolCalls: { id: string; name: string; args: string }[];
  finish: string | null;
  err: string;                // why it failed, when it did
}

const headers = (p: Provider) => ({ "content-type": "application/json", accept: "text/event-stream, application/json", authorization: `Bearer ${p.key}` });
/** Plain text for an error body. Gateways return HTML pages, often cut off mid-tag:
 *  keep the <title> ("Offline"), drop styles/scripts and any dangling tag. */
export const cleanErr = (s: string) => s
  .replace(/<(style|script)[\s\S]*?(<\/\1>|$)/gi, " ")
  .replace(/<title>([\s\S]*?)<\/title>/gi, " $1 ")
  .replace(/<[^>]*>/g, " ").replace(/<[^>]*$/, " ")
  .replace(/\s+/g, " ").trim().slice(0, 200);

/** One streamed chat call, aggregated into a single Reply. Never throws. */
export async function chat(f: F, p: Provider, body: Record<string, unknown>, timeoutMs = 60_000): Promise<Reply> {
  const t = Date.now();
  const empty = (status: number, err: string): Reply => ({ status, ms: Date.now() - t, content: "", raw: "", reasoning: "", toolCalls: [], finish: null, err });
  try {
    const res = await f(`${p.base}/chat/completions`, { method: "POST", headers: headers(p), body: JSON.stringify({ ...body, stream: true }), signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      const text = await res.text();
      let msg = text; try { msg = JSON.parse(text)?.error?.message ?? text; } catch { /* a gateway page */ }
      return empty(res.status, cleanErr(String(msg)) || `HTTP ${res.status}`);
    }
    const filter = new ThinkFilter();
    let content = "", raw = "", reasoning = "", finish: string | null = null;
    const tools = new Map<number, { id: string; name: string; args: string }>();
    for await (const j of readSSE(res)) {
      const ch = j?.choices?.[0]; if (!ch) continue;
      const d = ch.delta ?? {};
      if (typeof d.content === "string" && d.content) { raw += d.content; content += filter.push(d.content); }
      const r = d.reasoning_content ?? d.reasoning; if (typeof r === "string") reasoning += r;
      for (const tc of d.tool_calls ?? []) {
        const k = tc.index ?? 0; const cur = tools.get(k) ?? { id: "", name: "", args: "" };
        if (tc.id) cur.id = tc.id; if (tc.function?.name) cur.name = tc.function.name; if (tc.function?.arguments) cur.args += tc.function.arguments;
        tools.set(k, cur);
      }
      if (ch.finish_reason) finish = ch.finish_reason;
    }
    content = (content + filter.flush()).trim();
    return { status: 200, ms: Date.now() - t, content, raw: raw.trim(), reasoning: reasoning.trim(), toolCalls: [...tools.values()].filter((x) => x.name), finish, err: "" };
  } catch (e) {
    return empty(0, (e as Error)?.name === "TimeoutError" ? "timed out" : "network error");
  }
}

// ---- probes ---------------------------------------------------------------------
// A tiny solid-red square (64x64). Models that can see should say "red".
export const RED_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsEty/UMZxgi+hcEKLNO+FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywLPLIEA68ZURwAAAABJRU5ErkJggg==";

/** Output that loops or runs on: DeepSeek on Dahl answers "pong" with
 *  "pongpongpong response…" until the token limit, which burns tokens and is not a
 *  working model. A one-word request should not need more than a couple of hundred
 *  characters, and should not repeat itself. */
export const isDegenerate = (visible: string) => visible.length > 400 || /(.{3,20}?)\1{2,}/s.test(visible);

/** Does it answer, sensibly? Reasoning-only output counts: the model is up, just
 *  thinking. Looping or rambling output does not. */
export async function probeText(f: F, p: Provider, id: string, timeoutMs = 40_000): Promise<{ ok: boolean; ms: number; err: string }> {
  const r = await chat(f, p, { model: id, messages: [{ role: "user", content: "Reply with exactly one word: pong" }], max_tokens: 160 }, timeoutMs);
  const answered = r.status === 200 && (r.raw.length > 0 || r.reasoning.length > 0);
  const bad = answered && isDegenerate(r.content);
  const ok = answered && !bad;
  return { ok, ms: r.ms, err: ok ? "" : bad ? "degenerate output (loops or rambles)" : r.err || `HTTP ${r.status}, empty reply` };
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// A capability is "no" only on a definite answer. A timeout, 429 or 5xx says nothing
// about the capability, so those are retried instead of being recorded as "no".
async function capability(run: () => Promise<Reply>, passes: (r: Reply) => boolean, tries = 3, wait = 700): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const r = await run();
    if (passes(r)) return true;
    if (!(r.status === 0 || r.status === 429 || r.status >= 500)) return false; // a real "no" (400 "no images", empty tool reply, ...)
    if (i < tries - 1) await sleep(wait * (i + 1));
  }
  return false;
}

/** Can it actually read an image? */
export function probeVision(f: F, p: Provider, id: string, timeoutMs = 40_000): Promise<boolean> {
  return capability(
    () => chat(f, p, { model: id, max_tokens: 200, messages: [{ role: "user", content: [{ type: "text", text: "What is the main color of this image? Answer with one word." }, { type: "image_url", image_url: { url: RED_PNG } }] }] }, timeoutMs),
    (r) => r.status === 200 && /\bred\b/i.test(r.content || r.raw),
  );
}
const WEATHER_TOOL = { type: "function", function: { name: "get_weather", description: "Current weather for a city", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } };

/** Is it safe to attach tools to an ordinary request? Two things must hold:
 *   1. it calls a function when asked to (the run-code tool depends on this), and
 *   2. with a tool attached, a PLAIN question still gets a normal answer.
 *  (2) is not a formality. Some models accept tools and then answer with nothing
 *  (Gemini via Hybra), or emit malformed <think> markup that swallows the answer
 *  (MiniMax on Dahl), and every /shh message carries the memory tool. */
export async function probeTools(f: F, p: Provider, id: string, timeoutMs = 40_000): Promise<boolean> {
  const calls = await capability(
    () => chat(f, p, { model: id, max_tokens: 200, messages: [{ role: "user", content: "What is the weather in Osaka right now? Use the tool." }], tools: [WEATHER_TOOL] }, timeoutMs),
    (r) => r.status === 200 && r.toolCalls.some((c) => c.name === "get_weather"),
  );
  if (!calls) return false;
  return capability(
    () => chat(f, p, { model: id, max_tokens: 800, messages: [{ role: "user", content: "Name the capital of France in one word." }], tools: [WEATHER_TOOL] }, timeoutMs),
    (r) => r.status === 200 && /paris/i.test(r.content),
  );
}

// ---- which models to show, in what order ------------------------------------------
export interface ModelRow { id: string; ok: number; vision: number; tools: number; ms: number | null; err: string | null; checked_at: number }

// Provider first (hybra is the main one), then newest strong family, then speed.
const PROVIDER_ORDER = ["hybra", "dahl"];
const PREFER = [/gemini-3\.\d+-flash$/, /gemini-3\.\d+-pro$/, /gemini-2\.5-pro/, /gemini-3\./, /gemini/, /glm-5/i, /deepseek/i, /minimax/i];
const rankId = (ns: string) => {
  const s = splitId(ns); const raw = s?.id ?? ns;
  const pi = PROVIDER_ORDER.indexOf(s?.provider ?? ""); const fi = PREFER.findIndex((re) => re.test(raw));
  return (pi < 0 ? PROVIDER_ORDER.length : pi) * 100 + (fi < 0 ? PREFER.length : fi);
};

export const MAX_AGE_SEC = 45 * 60; // a pass older than this no longer counts

/** The models safe to offer right now: probed OK recently, best first. */
export function workingModels(rows: ModelRow[], nowSec: number, maxAgeSec = MAX_AGE_SEC): ModelRow[] {
  return rows
    .filter((r) => r.id !== "__lock" && r.ok === 1 && r.checked_at >= nowSec - maxAgeSec)
    .sort((a, b) => rankId(a.id) - rankId(b.id) || (a.ms ?? 1e9) - (b.ms ?? 1e9) || a.id.localeCompare(b.id));
}

/** Models to try for one request, in order: the one asked for (if it's working), then
 *  alternating between the rest of its provider and the OTHER providers. Alternating
 *  matters: a provider with fifteen models must not use up every attempt, or the
 *  second, more reliable provider would never be tried when the first is flaking.
 *  At most `max`. */
export function candidatesFor(working: ModelRow[], requested: string | undefined, max = 4): string[] {
  const ids = working.map((m) => m.id);
  const first = requested && ids.includes(requested) ? requested : ids[0];
  if (!first) return [];
  const prov = splitId(first)?.provider;
  const rest = ids.filter((id) => id !== first);
  const same = rest.filter((id) => splitId(id)?.provider === prov);
  const other = rest.filter((id) => splitId(id)?.provider !== prov);
  const out = [first];
  for (let i = 0; out.length < max && (i < same.length || i < other.length); i++) {
    if (i < same.length && out.length < max) out.push(same[i]);
    if (i < other.length && out.length < max) out.push(other[i]);
  }
  return out;
}

/** Candidate ids due for a probe: never-probed first, then the longest-unchecked.
 *  A working model is re-checked every 15 min, a failing one every 30 (a dead model
 *  needn't be hammered on a shared free service). The result alternates providers, so
 *  one with a few models is never starved behind one with seventy. */
export function needsProbe(ids: string[], rows: ModelRow[], nowSec: number, okStaleSec = 15 * 60, failStaleSec = 30 * 60): string[] {
  const by = new Map(rows.map((r) => [r.id, r]));
  const at = (id: string) => by.get(id)?.checked_at ?? 0;
  const due = ids
    .filter((id) => { const r = by.get(id); return !r || !r.checked_at || r.checked_at < nowSec - (r.ok ? okStaleSec : failStaleSec); })
    .sort((a, b) => at(a) - at(b) || rankId(a) - rankId(b));
  const groups = new Map<string, string[]>();
  for (const id of due) { const k = splitId(id)?.provider ?? ""; const g = groups.get(k); if (g) g.push(id); else groups.set(k, [id]); }
  const lists = [...groups.values()], out: string[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

// ---- keeping the list fresh ------------------------------------------------------
export interface Store {
  rows(): Promise<ModelRow[]>;
  upsert(r: ModelRow): Promise<void>;
  /** Take the refresh lease; false when another refresh holds it. */
  lock(nowSec: number, ttlSec: number): Promise<boolean>;
}
export interface RefreshOpts {
  now?: () => number;      // ms clock (injectable)
  budget?: number;         // max models probed per run
  maxRequests?: number;    // hard cap on upstream calls per run (Workers subrequest limit)
  concurrency?: number;
  deadlineMs?: number;     // stop starting new probes after this long
  force?: boolean;         // re-probe everything, not just the stale
  leaseSec?: number;       // how long a run blocks others (default 45; 0 = a manual re-check, take over)
  timeoutMs?: number;
}
export interface RefreshResult { probed: number; ok: number; skipped: boolean; requests: number; listErrors: string[] }

async function listModels(f: F, p: Provider): Promise<string[]> {
  const r = await f(`${p.base}/models`, { headers: { accept: "application/json", authorization: `Bearer ${p.key}` }, signal: AbortSignal.timeout(20_000) });
  const j: any = await r.json();
  return (j?.data ?? []).map((m: { id: string }) => m.id).filter((id: unknown): id is string => typeof id === "string" && isChatId(id));
}

/** Probe a bounded batch of models and persist each result as it lands, so partial
 *  progress survives the run being cut short. A lease in the store lets only one run
 *  proceed at a time. Capabilities (vision, tools) are measured once per working
 *  model, since they don't flap the way uptime does. */
export async function refreshModels(f: F, providers: Provider[], store: Store, o: RefreshOpts = {}): Promise<RefreshResult> {
  const clock = o.now ?? Date.now;
  if (!(await store.lock(Math.floor(clock() / 1000), o.leaseSec ?? 45))) return { probed: 0, ok: 0, skipped: true, requests: 0, listErrors: [] };

  const cap = o.maxRequests ?? 45;
  let requests = 0;
  const listErrors: string[] = [];
  const byProv = new Map<string, Provider>();
  const ids: string[] = [];
  for (const p of providers) {
    requests++;
    try { for (const id of await listModels(f, p)) { ids.push(nsId(p.id, id)); byProv.set(p.id, p); } }
    catch (e) { listErrors.push(`${p.id}: ${(e as Error)?.message || "model list unreachable"}`); }
  }

  const rows = await store.rows();
  const nowSec = Math.floor(clock() / 1000);
  const todo = (o.force ? [...ids] : needsProbe(ids, rows, nowSec)).slice(0, o.budget ?? 24);
  const known = new Map(rows.map((r) => [r.id, r]));
  const start = clock();
  let probed = 0, okCount = 0, next = 0;
  const to = o.timeoutMs ?? 40_000;

  const worker = async () => {
    for (;;) {
      if (clock() - start > (o.deadlineMs ?? 22_000) || requests >= cap) return;
      const ns = todo[next++];
      if (ns === undefined) return;
      const s = splitId(ns)!; const p = byProv.get(s.provider)!;
      requests++;
      const t = await probeText(f, p, s.id, to);
      const prev = known.get(ns);
      const row: ModelRow = { id: ns, ok: t.ok ? 1 : 0, vision: t.ok ? (prev?.vision ?? 0) : 0, tools: t.ok ? (prev?.tools ?? 0) : 0, ms: t.ok ? t.ms : null, err: t.ok ? null : t.err, checked_at: Math.floor(clock() / 1000) };
      if (t.ok && (!prev || !prev.checked_at || o.force) && requests + 2 <= cap) {
        requests += 2;
        const [v, tl] = await Promise.all([probeVision(f, p, s.id, to), probeTools(f, p, s.id, to)]);
        row.vision = v ? 1 : 0; row.tools = tl ? 1 : 0;
      }
      await store.upsert(row);
      probed++; if (row.ok) okCount++;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(o.concurrency ?? 4, todo.length)) }, worker));
  return { probed, ok: okCount, skipped: false, requests, listErrors };
}

/** Record a failure seen in real use, so a dead model drops out of the list at once. */
export async function markDown(store: Store, id: string, err: string, nowSec: number): Promise<void> {
  const prev = (await store.rows()).find((r) => r.id === id);
  await store.upsert({ id, ok: 0, vision: prev?.vision ?? 0, tools: prev?.tools ?? 0, ms: null, err: err.slice(0, 160), checked_at: nowSec });
}

// ---- failover ----------------------------------------------------------------------
/** Run `chat` against each candidate in turn until one answers. `body` may be a
 *  function of the candidate, so each model gets only what it supports (tools,
 *  images). A model is reported through `onDown` only for a genuine model fault; a
 *  4xx caused by the request itself moves on to the next model without blaming it. */
export async function chatWithFailover(
  f: F, providers: Provider[], candidates: string[], body: Record<string, unknown> | ((ns: string) => Record<string, unknown>),
  o: { timeoutMs?: number; onDown?: (id: string, err: string) => void } = {},
): Promise<{ reply: Reply; model: string | null; tried: string[] }> {
  const tried: string[] = [];
  let last: Reply = { status: 0, ms: 0, content: "", raw: "", reasoning: "", toolCalls: [], finish: null, err: "no working model" };
  for (const ns of candidates) {
    const s = splitId(ns); const p = s && providers.find((x) => x.id === s.provider);
    if (!s || !p) continue;
    tried.push(ns);
    const reply = await chat(f, p, { ...(typeof body === "function" ? body(ns) : body), model: s.id }, o.timeoutMs);
    const usable = reply.status === 200 && (reply.content || reply.toolCalls.length || reply.raw);
    if (usable) return { reply, model: ns, tried };
    last = reply;
    if (reply.status === 200 || modelFault(reply.status)) o.onDown?.(ns, reply.err || "empty reply");
  }
  return { reply: last, model: null, tried };
}
