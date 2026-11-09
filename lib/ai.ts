// The AI backend for /shh: Inception Labs (https://inceptionlabs.ai) for text, and keyless OVHcloud
// AI Endpoints for reading images; both OpenAI-compatible. Its key is hardcoded as the default, a TEST key on a test account chosen by the
// owner; INCEPTION_API_KEY in the environment overrides it.
//
// Because upstreams flake, the model list is never taken on trust: every model is
// PROBED with a real request, and only the ones that actually answered recently are
// offered. Everything here is pure (fetch and storage are injected) so it runs in
// the route and in tests alike.
//
// Everything is STREAMED, including probes and one-shot calls, because that is how the
// chat sends requests; a probe must test the same path the user will take.

type Env = Record<string, string | undefined>;
type F = typeof fetch;
/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- providers ------------------------------------------------------------------
// `concurrency` is how many probes may run at once against this provider.
// `fixed` (keyless providers): the models offered, with what each can do, as verified by hand. A keyless
// service rate-limits per model (OVHcloud: 2 requests a minute per IP), so these are not probed for
// capabilities (that would spend the allowance) and a 429 is "busy, try the next one", never "down".
export interface Provider { id: string; label: string; base: string; key: string; concurrency: number; keyless?: boolean; fixed?: Record<string, { vision: boolean; tools: boolean }> }

const PROVIDERS: { id: string; label: string; base: string; keyVar: string; defaultKey: string; concurrency: number; keyless?: boolean; fixed?: Provider["fixed"] }[] = [
  { id: "inception", label: "Inception", base: "https://api.inceptionlabs.ai/v1", keyVar: "INCEPTION_API_KEY", defaultKey: "sk_828e53bbd4422201bd577e47c7f9c5282ec26c5c0217057758874c910c4f2650", concurrency: 4 },
  // Image readers with no key at all (OVHcloud AI Endpoints, anonymous access). Checked live with a
  // picture of text and shapes: all three read it correctly. Inception cannot see images, so these
  // are what an image in /shh is sent to.
  {
    id: "ovh", label: "OVHcloud", base: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1", keyVar: "", defaultKey: "", concurrency: 1, keyless: true,
    fixed: {
      "Qwen2.5-VL-72B-Instruct": { vision: true, tools: false },
      "Mistral-Small-3.2-24B-Instruct-2506": { vision: true, tools: false },
      "Qwen3.8-27B": { vision: true, tools: false },
    },
  },
  // Kilo's anonymous gateway (about 200 requests an hour per IP). These six read the test picture
  // correctly with no key; they are previews and free tiers, so they come and go, which the regular
  // text probe notices (a model that stops answering drops out of the list by itself).
  {
    id: "kilo", label: "Kilo", base: "https://api.kilo.ai/api/gateway", keyVar: "", defaultKey: "", concurrency: 2, keyless: true,
    fixed: {
      "kilo-auto/small": { vision: true, tools: false },
      "nvidia/nemotron-3.5-super-vl:free": { vision: true, tools: false },
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": { vision: true, tools: false },
      "openrouter/free": { vision: true, tools: false },
      "stealth/crouton-alpha": { vision: true, tools: false },
      "dots-studio/dots-3-note-preview:free": { vision: true, tools: false },
    },
  },
];

/** The providers this deployment has keys for. */
export function providersFor(env: Env): Provider[] {
  return PROVIDERS.flatMap((p) => {
    if (p.keyless) return [{ id: p.id, label: p.label, base: p.base, key: "", concurrency: p.concurrency, keyless: true, fixed: p.fixed }];
    const key = (env[p.keyVar] ?? "").trim() || p.defaultKey;
    return key ? [{ id: p.id, label: p.label, base: p.base, key, concurrency: p.concurrency }] : [];
  });
}

// A model is addressed as "provider:model-id" everywhere (client, DB, requests),
// so ids from different providers can never collide.
export const nsId = (provider: string, id: string) => `${provider}:${id}`;
export function splitId(v: string): { provider: string; id: string } | null {
  const i = v.indexOf(":");
  return i > 0 ? { provider: v.slice(0, i), id: v.slice(i + 1) } : null;
}
export const providerOf = (providers: Provider[], v: string) => { const s = splitId(v); return s ? providers.find((p) => p.id === s.provider) ?? null : null; };

// image/*, whisper, tts, embedding, reward and safety-classifier entries share the /models
// list but aren't chat models. (llama-guard answers "safe" to everything: it must not be offered.)
export const isChatId = (id: string) => !/^image\//i.test(id) && !/whisper|tts|embed|rerank|guard|safety|reward|classif|moderat|detector|parse|nvclip|vila|neva|speech|asr|translate/i.test(id);

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
  // Some models open their answer with an internal channel marker ("thought" then
  // "<channel|>") instead of a think tag. That is decided from the first characters,
  // so the start of the text is held back until there are enough to judge.
  private head: string | null = "";
  private static readonly CHANNEL_PREFIX = /^\s*thought\s*\n\s*<\|?channel\|?>\s*|^\s*<\|?channel\|?>\s*/i;
  private static readonly CHANNEL_TAG = /<\|?channel\|?>/gi;

  push(chunk: string): string {
    if (this.head !== null) {
      this.head += chunk;
      if (this.head.length < 40 && !/<\|?channel\|?>/i.test(this.head)) return "";
      const h = this.head; this.head = null;
      return this.think(h.replace(ThinkFilter.CHANNEL_PREFIX, "").replace(ThinkFilter.CHANNEL_TAG, ""));
    }
    return this.think(chunk);
  }

  flush(): string {
    let out = "";
    if (this.head !== null) { const h = this.head; this.head = null; out += this.think(h.replace(ThinkFilter.CHANNEL_PREFIX, "").replace(ThinkFilter.CHANNEL_TAG, "")); }
    out += this.end();
    return out;
  }

  // Think-block handling for text that has already passed the head check.
  private think(chunk: string): string {
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

  private end(): string { const r = this.inThink ? "" : this.take(this.buf); this.buf = ""; return r; }

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

const headers = (p: Provider) => ({ "content-type": "application/json", accept: "text/event-stream, application/json", ...(p.key ? { authorization: `Bearer ${p.key}` } : {}) });
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
export async function probeText(f: F, p: Provider, id: string, timeoutMs = 25_000): Promise<{ ok: boolean; ms: number; err: string }> {
  const r = await chat(f, p, { model: id, messages: [{ role: "user", content: "Reply with exactly one word: pong" }], max_tokens: 160 }, timeoutMs);
  // Visible text is what the user sees: a model that only emits reasoning is not usable.
  const answered = r.status === 200 && r.raw.length > 0;
  const bad = answered && isDegenerate(r.content);
  const ok = answered && !bad;
  return { ok, ms: r.ms, err: ok ? "" : bad ? "degenerate output (loops or rambles)" : r.err || (r.status === 200 ? (r.reasoning ? "reasoning only, no visible answer" : "empty reply") : `HTTP ${r.status}`) };
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
export function probeVision(f: F, p: Provider, id: string, timeoutMs = 25_000): Promise<boolean> {
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
export async function probeTools(f: F, p: Provider, id: string, timeoutMs = 25_000): Promise<boolean> {
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

// Provider order (only one for now), then speed.
const PROVIDER_ORDER = ["inception", "ovh", "kilo"];
const rankId = (ns: string) => {
  const pi = PROVIDER_ORDER.indexOf(splitId(ns)?.provider ?? "");
  return pi < 0 ? PROVIDER_ORDER.length : pi;
};

// A hand-checked provider lists its models best first (the order in PROVIDERS), and that order wins
// over raw speed: the fastest image reader is not always the one that reads best.
const fixedRank = (ns: string) => {
  const s = splitId(ns);
  const keys = s ? Object.keys(PROVIDERS.find((p) => p.id === s.provider)?.fixed ?? {}) : [];
  const i = s ? keys.indexOf(s.id) : -1;
  return i < 0 ? 1e6 : i;
};

export const MAX_AGE_SEC = 45 * 60; // a pass older than this no longer counts

/** The models safe to offer right now: probed OK recently, best first. */
export function workingModels(rows: ModelRow[], nowSec: number, maxAgeSec = MAX_AGE_SEC): ModelRow[] {
  return rows
    .filter((r) => r.id !== "__lock" && r.ok === 1 && r.checked_at >= nowSec - maxAgeSec)
    .sort((a, b) => rankId(a.id) - rankId(b.id) || fixedRank(a.id) - fixedRank(b.id) || (a.ms ?? 1e9) - (b.ms ?? 1e9) || a.id.localeCompare(b.id));
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
  if (p.fixed) return Object.keys(p.fixed); // a hand-checked list: no request spent asking
  const r = await f(`${p.base}/models`, { headers: { accept: "application/json", ...(p.key ? { authorization: `Bearer ${p.key}` } : {}) }, signal: AbortSignal.timeout(20_000) });
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
  const ids: string[] = [];
  for (const p of providers) {
    requests++;
    try { for (const id of await listModels(f, p)) ids.push(nsId(p.id, id)); }
    catch (e) { listErrors.push(`${p.id}: ${(e as Error)?.message || "model list unreachable"}`); }
  }

  const rows = await store.rows();
  const nowSec = Math.floor(clock() / 1000);
  const todo = (o.force ? [...ids] : needsProbe(ids, rows, nowSec)).slice(0, o.budget ?? 24);
  const known = new Map(rows.map((r) => [r.id, r]));
  const start = clock();
  let probed = 0, okCount = 0;
  const to = o.timeoutMs ?? 25_000;
  const deadline = o.deadlineMs ?? 22_000;

  // Each provider has its own lanes (one provider may allow fewer parallel requests), and a
  // provider's lanes never exceed its limit, whatever the other providers are doing.
  const runLane = async (queue: string[], p: Provider) => {
    for (;;) {
      if (clock() - start > deadline || requests >= cap) return;
      const ns = queue.shift();
      if (ns === undefined) return;
      const s = splitId(ns)!;
      requests++;
      const t = await probeText(f, p, s.id, to);
      const prev = known.get(ns);
      const row: ModelRow = { id: ns, ok: t.ok ? 1 : 0, vision: t.ok ? (prev?.vision ?? 0) : 0, tools: t.ok ? (prev?.tools ?? 0) : 0, ms: t.ok ? t.ms : null, err: t.ok ? null : t.err, checked_at: Math.floor(clock() / 1000) };
      const fixed = p.fixed?.[s.id];
      if (t.ok && fixed) { row.vision = fixed.vision ? 1 : 0; row.tools = fixed.tools ? 1 : 0; }
      else if (t.ok && (!prev || !prev.checked_at || o.force) && requests + 2 <= cap && clock() - start < deadline) {
        requests += 2;
        const [v, tl] = await Promise.all([probeVision(f, p, s.id, to), probeTools(f, p, s.id, to)]);
        row.vision = v ? 1 : 0; row.tools = tl ? 1 : 0;
      }
      await store.upsert(row);
      probed++; if (row.ok) okCount++;
    }
  };
  const lanes: Promise<void>[] = [];
  for (const p of providers) {
    const queue = todo.filter((ns) => splitId(ns)?.provider === p.id);
    for (let i = 0; i < Math.min(p.concurrency, queue.length); i++) lanes.push(runLane(queue, p));
  }
  await Promise.all(lanes);
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
    // a keyless service's 429 only means "slow down" (it limits per model): try the next, do not drop this one
    if (reply.status === 200 || (modelFault(reply.status) && !(p.keyless && reply.status === 429))) o.onDown?.(ns, reply.err || "empty reply");
  }
  return { reply: last, model: null, tried };
}
