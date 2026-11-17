// Cloud chats for /shh: the rules both sides share. A chat is either "cloud" (a copy lives on the member's account and follows them to
// every device) or "local" (only in this browser, never sent). Each chat is one document that is saved whole; when two devices have
// changed the same chat, the later change wins. A deleted cloud chat leaves a tombstone so every other device removes its copy too.

export interface LocalThread { id: string; title: string; updatedAt: number; cloud?: boolean }
export interface RemoteMeta { id: string; title: string; updatedAt: number; deleted: boolean }
export interface SyncPlan {
  push: string[];          // local cloud chats the account has not got, or has an older copy of
  pull: RemoteMeta[];      // the account's chats this device has not got, or has an older copy of
  remove: string[];        // local cloud chats that were deleted from the account elsewhere
}

export const THREAD_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
export const CLOUD_MAX_THREADS = 300;
export const CLOUD_ROW_BYTES = 1_900_000; // D1 rows top out at 2 MB: the server refuses anything bigger, the client trims well below it
export const CLOUD_TARGET_BYTES = 1_500_000;

/** What to do to bring this device and the account in line. Pure: no storage, no network. */
export function planSync(local: LocalThread[], remote: RemoteMeta[]): SyncPlan {
  const L = new Map(local.map((t) => [t.id, t]));
  const R = new Map(remote.map((r) => [r.id, r]));
  const plan: SyncPlan = { push: [], pull: [], remove: [] };
  for (const r of remote) {
    const l = L.get(r.id);
    if (r.deleted) {
      // gone from the account. A copy edited AFTER that is a revival, not a leftover: it goes back up.
      if (l?.cloud) (l.updatedAt > r.updatedAt ? plan.push : plan.remove).push(r.id);
      continue;
    }
    if (!l) { plan.pull.push(r); continue; }
    if (!l.cloud) continue; // a chat kept on this device only is never touched, even if an old cloud copy exists
    if (l.updatedAt > r.updatedAt) plan.push.push(r.id);
    else if (l.updatedAt < r.updatedAt) plan.pull.push(r);
  }
  for (const l of local) if (l.cloud && !R.has(l.id)) plan.push.push(l.id);
  return plan;
}

type Json = Record<string, unknown>;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
const strs = (v: unknown, n: number, each: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, n).map((x) => x.slice(0, each)) : undefined);

/** Keep only the parts of a message the chat uses, within sane limits. Applied to everything that goes up and everything that comes back. */
export function cleanMessages(raw: unknown): Json[] {
  if (!Array.isArray(raw)) return [];
  const out: Json[] = [];
  for (const m of raw.slice(-1000)) {
    if (!m || typeof m !== "object") continue;
    const o = m as Json;
    if (o.role !== "user" && o.role !== "assistant") continue;
    const msg: Json = { role: o.role, content: str(o.content, 200_000) };
    const images = strs(o.images, 6, 700_000); if (images?.length) msg.images = images;
    if (Array.isArray(o.docs)) {
      const docs = o.docs.slice(0, 30).filter((d): d is Json => !!d && typeof d === "object").map((d) => ({ name: str(d.name, 120), content: str(d.content, 300_000) }));
      if (docs.length) msg.docs = docs;
    }
    if (Array.isArray(o.steps)) {
      const steps = o.steps.slice(0, 30).filter((s): s is Json => !!s && typeof s === "object").map((s) => ({
        id: str(s.id, 64), name: str(s.name, 60), language: str(s.language, 30), code: str(s.code, 20_000), query: str(s.query, 500), url: str(s.url, 500), output: str(s.output, 20_000),
        status: s.status === "running" ? "done" : s.status, // a step still "running" when it was saved will never finish
      }));
      if (steps.length) msg.steps = steps;
    }
    const memories = strs(o.memories, 20, 500); if (memories?.length) msg.memories = memories;
    if (typeof o.orig === "string") msg.orig = o.orig.slice(0, 200_000);
    if (o.via && typeof o.via === "object") msg.via = { model: str((o.via as Json).model, 120), ...(typeof (o.via as Json).wanted === "string" ? { wanted: str((o.via as Json).wanted, 120) } : {}) };
    out.push(msg);
  }
  return out;
}

const size = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/** A copy small enough for one database row. Photos go first (they are what is big), then attached files, then old tool output, then the oldest messages. */
export function trimForCloud(raw: unknown, target = CLOUD_TARGET_BYTES): { messages: Json[]; trimmed: boolean } {
  // a reply still streaming has no final text yet; it goes up on a later pass once it is done
  let msgs = cleanMessages(Array.isArray(raw) ? raw.filter((m) => !(m && (m as { pending?: boolean }).pending)) : raw);
  if (size(msgs) <= target) return { messages: msgs, trimmed: false };
  const steps: ((ms: Json[]) => Json[])[] = [
    (ms) => ms.map((m, i) => (i >= ms.length - 3 ? m : { ...m, images: undefined })),
    (ms) => ms.map((m) => ({ ...m, images: undefined })),
    (ms) => ms.map((m) => ({ ...m, docs: Array.isArray(m.docs) ? (m.docs as Json[]).map((d) => ({ name: d.name, content: "" })) : undefined })),
    (ms) => ms.map((m) => ({ ...m, steps: Array.isArray(m.steps) ? (m.steps as Json[]).map((s) => ({ ...s, output: str(s.output, 1500), code: str(s.code, 3000) })) : undefined })),
  ];
  for (const f of steps) { msgs = f(msgs); if (size(msgs) <= target) return { messages: msgs, trimmed: true }; }
  while (msgs.length > 1 && size(msgs) > target) msgs = msgs.slice(1);
  return { messages: msgs, trimmed: true };
}
