"use client";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { planSync, trimForCloud, type LocalThread, type RemoteMeta } from "@/lib/shh-cloud";

// Keeps this browser's /shh chats and the member's account in line. localStorage stays the source of truth for the page (the chat reads
// and writes it exactly as before); this hook only copies chats that are marked `cloud` up and down, on a timer and shortly after a change.
// Polling over HTTPS, never Realtime (see the Cloudflare note in the project docs).

const THREADS_KEY = "shh:threads";
const OWNER_KEY = "shh:cloudUser";   // which account the `cloud` flags in this browser belong to
const DEL_KEY = "shh:cloudDel";      // deletes (and "keep on this device only" moves) the account has not heard about yet
const NAG_KEY = "shh:cloudNag";      // the member said "not now" to the move-to-account banner
const threadKey = (id: string) => `shh:thread:${id}`;
const EVERY_MS = 25_000;
const AFTER_CHANGE_MS = 2_500;
const PULLS_PER_PASS = 8;
const BATCH_BYTES = 3_000_000;

export type CloudStatus = "idle" | "syncing" | "ok" | "error";

function readJson<V>(k: string, d: V): V { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as V) : d; } catch { return d; } }
function writeJson(k: string, v: unknown): boolean { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }

async function post(code: string, body: Record<string, unknown>) {
  const r = await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, code }) });
  const d = await r.json().catch(() => ({})); // always read the body: a rejection says why
  if (!r.ok) throw new Error(d?.error || `http ${r.status}`);
  return d;
}

interface Opts<T extends LocalThread> {
  code: string;
  threads: T[];
  setThreads: Dispatch<SetStateAction<T[]>>;
  activeId: string;
  setActiveId: (id: string) => void;
  msgs: unknown[];
  busy: boolean;
  /** the active chat's messages changed because the account had a newer copy */
  applyActive: (msgs: unknown[]) => void;
}

export function useCloudChats<T extends LocalThread>(o: Opts<T>) {
  const [status, setStatus] = useState<CloudStatus>("idle");
  const [error, setError] = useState("");
  const [lastAt, setLastAt] = useState(0);
  const [localOnly, setLocalOnly] = useState(0);
  const [nagHidden, setNagHidden] = useState(true); // true until storage is read, so the banner never flashes

  // everything the long-lived timers need, kept current without re-creating them
  const R = useRef(o); R.current = o;
  const syncing = useRef(false);
  const again = useRef(false);

  const countLocalOnly = useCallback(() => {
    const list = readJson<T[]>(THREADS_KEY, []);
    let n = 0;
    for (const t of list) {
      if (t.cloud) continue;
      let raw: string | null = null;
      try { raw = localStorage.getItem(threadKey(t.id)); } catch { /* */ }
      if (raw && raw.length > 4) n++; // "[]" is an empty chat; anything longer has messages
    }
    setLocalOnly(n);
  }, []);

  const sync = useCallback(async () => {
    const { code } = R.current;
    if (!code) return;
    if (syncing.current) { again.current = true; return; }
    syncing.current = true;
    setStatus("syncing");
    let problem = "";
    try {
      const list = await post(code, { op: "cloud_list" });
      const user = String(list.user || "");

      // A browser shared by two accounts must never push one member's chats into the other's. When the account changes, every chat here
      // becomes "this device only" for the new member.
      const owner = localStorage.getItem(OWNER_KEY);
      if (user && owner && owner !== user) {
        const stripped = readJson<T[]>(THREADS_KEY, []).map((t) => (t.cloud ? { ...t, cloud: false } : t));
        writeJson(THREADS_KEY, stripped);
        writeJson(DEL_KEY, []);
        R.current.setThreads((p) => p.map((t) => (t.cloud ? { ...t, cloud: false } : t)));
      }
      if (user) try { localStorage.setItem(OWNER_KEY, user); } catch { /* */ }

      // 1. tell the account about deletes made while offline (or chats moved to "this device only")
      let dels = readJson<string[]>(DEL_KEY, []);
      for (const id of [...dels]) {
        try { await post(code, { op: "cloud_delete", id, at: Date.now() }); dels = dels.filter((x) => x !== id); } catch { break; }
      }
      writeJson(DEL_KEY, dels);
      const waiting = new Set(dels);

      const remote: RemoteMeta[] = (Array.isArray(list.threads) ? list.threads : []).filter((r: RemoteMeta) => !waiting.has(r.id));
      const local = readJson<T[]>(THREADS_KEY, []);
      const plan = planSync(local, remote);
      const active = () => R.current.activeId;
      const dirty = () => { // the open chat has changes the debounced autosave has not written yet
        let stored = "[]"; try { stored = localStorage.getItem(threadKey(active())) ?? "[]"; } catch { /* */ }
        return JSON.stringify(R.current.msgs) !== stored;
      };

      // 2. chats deleted from the account on another device
      if (plan.remove.length) {
        const gone = new Set(plan.remove);
        for (const id of gone) try { localStorage.removeItem(threadKey(id)); } catch { /* */ }
        const fresh = crypto.randomUUID();
        R.current.setThreads((p) => {
          let next = p.filter((t) => !gone.has(t.id));
          if (!next.length) { next = [{ id: fresh, title: "new chat", updatedAt: Date.now(), cloud: true } as T]; try { localStorage.setItem(threadKey(fresh), "[]"); } catch { /* */ } }
          writeJson(THREADS_KEY, next);
          return next;
        });
        if (gone.has(active())) {
          const rest = local.filter((t) => !gone.has(t.id)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
          R.current.setActiveId(rest?.id ?? fresh);
        }
      }

      // 3. chats the account has that this device lacks (or has an older copy of)
      const pulled: LocalThread[] = [];
      for (const m of plan.pull.slice(0, PULLS_PER_PASS)) {
        const isActive = m.id === active();
        if (isActive && (R.current.busy || dirty())) continue; // never replace a chat the member is in the middle of
        try {
          const d = await post(code, { op: "cloud_get", id: m.id });
          if (d.deleted) continue;
          const messages = Array.isArray(d.messages) ? d.messages : [];
          if (isActive && (R.current.busy || dirty())) continue; // it may have changed during the download
          if (!writeJson(threadKey(m.id), messages)) { problem = "this browser is out of storage space"; continue; }
          pulled.push({ id: m.id, title: String(d.title || m.title || "new chat"), updatedAt: Number(d.updatedAt) || m.updatedAt, cloud: true });
          if (isActive) R.current.applyActive(messages);
        } catch (e) { problem = e instanceof Error ? e.message : "couldn't download a chat"; }
      }
      if (pulled.length) {
        const by = new Map(pulled.map((p) => [p.id, p]));
        R.current.setThreads((p) => {
          const next = p.map((t) => (by.has(t.id) ? ({ ...t, ...by.get(t.id)! } as T) : t));
          for (const x of pulled) if (!p.some((t) => t.id === x.id)) next.push(x as T);
          writeJson(THREADS_KEY, next);
          return next;
        });
      }

      // 4. chats this device has that the account lacks (or has an older copy of)
      const batches: { id: string; title: string; updatedAt: number; messages: unknown[] }[][] = [[]];
      let bytes = 0;
      for (const id of plan.push) {
        if (id === active() && R.current.busy) continue; // still streaming: it goes up once the reply is done
        const t = local.find((x) => x.id === id);
        const body = readJson<unknown[]>(threadKey(id), []);
        if (!t || !Array.isArray(body) || !body.length) continue; // an empty chat is not worth a row
        const item = { id, title: t.title, updatedAt: t.updatedAt, messages: trimForCloud(body).messages };
        const size = JSON.stringify(item).length;
        if (bytes + size > BATCH_BYTES || batches[batches.length - 1].length >= 10) { batches.push([]); bytes = 0; }
        batches[batches.length - 1].push(item); bytes += size;
      }
      for (const b of batches) {
        if (!b.length) continue;
        try { await post(code, { op: "cloud_put", threads: b }); } catch (e) { problem = e instanceof Error ? e.message : "couldn't save a chat"; }
      }
    } catch (e) {
      problem = e instanceof Error ? e.message : "offline";
    } finally {
      syncing.current = false;
      setError(problem);
      setStatus(problem ? "error" : "ok");
      if (!problem) setLastAt(Date.now());
      countLocalOnly();
      if (again.current) { again.current = false; setTimeout(sync, 800); }
    }
  }, [countLocalOnly]);

  // first pass once the code is in, then on a timer while the tab is visible, and whenever it becomes visible again
  useEffect(() => {
    if (!o.code) return;
    try { setNagHidden(localStorage.getItem(NAG_KEY) === "1"); } catch { setNagHidden(false); }
    const t0 = setTimeout(sync, 300);
    const iv = setInterval(() => { if (!document.hidden) sync(); }, EVERY_MS);
    const vis = () => { if (!document.hidden) sync(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("online", vis);
    return () => { clearTimeout(t0); clearInterval(iv); document.removeEventListener("visibilitychange", vis); window.removeEventListener("online", vis); };
  }, [o.code, sync]);

  // soon after any change to the chat list (a new message bumps its updatedAt)
  const sig = o.threads.map((t) => `${t.id}:${t.updatedAt}:${t.cloud ? 1 : 0}`).join("|");
  useEffect(() => {
    if (!o.code || !o.threads.length) return;
    const t = setTimeout(sync, AFTER_CHANGE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, o.code, sync]);

  // keep the banner count honest when chats are added, removed or flagged
  const shape = o.threads.map((t) => `${t.id}:${t.cloud ? 1 : 0}`).join("|");
  useEffect(() => { countLocalOnly(); }, [shape, countLocalOnly]);

  const queueDelete = (id: string, on: boolean) => {
    const cur = readJson<string[]>(DEL_KEY, []).filter((x) => x !== id);
    writeJson(DEL_KEY, on ? [...cur, id] : cur);
  };

  /** Move one chat to the account (true) or keep it on this device only (false). */
  const setCloud = (id: string, on: boolean) => {
    // Bumped when it goes to the account: a tombstone from an earlier "this device only" move must be older than this edit, or it would delete the chat.
    const at = Date.now();
    R.current.setThreads((p) => {
      const next = p.map((t) => (t.id === id ? ({ ...t, cloud: on, ...(on ? { updatedAt: at } : {}) } as T) : t));
      writeJson(THREADS_KEY, next);
      return next;
    });
    queueDelete(id, !on);
    setTimeout(sync, 200);
  };

  /** A cloud chat was deleted here: tell the account so every other device drops it too (retried until it lands). */
  const forget = (id: string) => { queueDelete(id, true); setTimeout(sync, 200); };

  /** The banner: everything on this device that is not on the account yet. */
  const moveAllToCloud = () => {
    const at = Date.now();
    R.current.setThreads((p) => {
      const next = p.map((t) => {
        if (t.cloud) return t;
        let raw: string | null = null; try { raw = localStorage.getItem(threadKey(t.id)); } catch { /* */ }
        return raw && raw.length > 4 ? ({ ...t, cloud: true, updatedAt: Math.max(t.updatedAt, at) } as T) : t;
      });
      writeJson(THREADS_KEY, next);
      for (const t of next) if (t.cloud) { const d = readJson<string[]>(DEL_KEY, []); if (d.includes(t.id)) writeJson(DEL_KEY, d.filter((x) => x !== t.id)); }
      return next;
    });
    setTimeout(sync, 200);
  };

  const hideNag = () => { setNagHidden(true); try { localStorage.setItem(NAG_KEY, "1"); } catch { /* */ } };

  return { status, error, lastAt, localOnly, showNag: !nagHidden && localOnly > 0, hideNag, setCloud, forget, moveAllToCloud, syncNow: sync };
}
