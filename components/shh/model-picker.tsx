"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// The model picker for /shh. The server only ever returns models whose last live
// probe passed (see lib/ai.ts), and this keeps that list current: it polls while the
// server is still working out what's up, re-reads it every few minutes (models come
// and go), and lets you force a re-check.

export interface ModelInfo { id: string; provider: string; label: string; vision: boolean; tools: boolean; ms: number | null }
interface Listing { models: ModelInfo[]; default: string | null; checking: boolean }

const REFRESH_MS = 5 * 60_000;   // re-read the list now and then; models flip all day
const POLL_MS = 5_000;           // while the server is still checking
const MAX_POLLS = 30;            // ~2.5 minutes, then show the empty state instead of spinning forever

export function useModelList(code: string | null) {
  const [list, setList] = useState<Listing>({ models: [], default: null, checking: true });
  const [loaded, setLoaded] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const polls = useRef(0);

  const read = useCallback(async (): Promise<Listing | null> => {
    if (!code) return null;
    try {
      const r = await fetch(`/api/shh?code=${encodeURIComponent(code)}`);
      const d = await r.json();
      if (!r.ok || !Array.isArray(d.models)) return null;
      const next: Listing = { models: d.models, default: d.default ?? null, checking: !!d.checking };
      setList(next); setLoaded(true);
      return next;
    } catch { return null; }
  }, [code]);

  // first load, then poll while the server is still working out what's up
  useEffect(() => {
    if (!code) return;
    let stop = false; polls.current = 0;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const n = await read();
      if (stop) return;
      if (n && n.models.length === 0 && n.checking && polls.current++ < MAX_POLLS) t = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [code, read]);

  // keep the list fresh while the tab is open
  useEffect(() => {
    if (!code) return;
    const iv = setInterval(() => { if (document.visibilityState === "visible") read(); }, REFRESH_MS);
    return () => clearInterval(iv);
  }, [code, read]);

  const recheck = useCallback(async () => {
    if (!code || rechecking) return;
    setRechecking(true);
    try {
      const r = await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "models_refresh", code }) });
      const d = await r.json();
      if (r.ok && Array.isArray(d.models)) { setList({ models: d.models, default: d.default ?? null, checking: !!d.checking }); setLoaded(true); }
    } catch { /* leave the list as it was */ }
    setRechecking(false);
  }, [code, rechecking]);

  return { models: list.models, defaultId: list.default, checking: list.checking, loaded, rechecking, recheck };
}

const MODEL_KEY = "shh:model";

/** The selected model, remembered on this device. A saved choice that is no longer in
 *  the working list (an old provider's id, or a model that has since gone down) is
 *  replaced by the best working one instead of being sent to a dead model. */
export function useSelectedModel(models: ModelInfo[], defaultId: string | null, loaded: boolean) {
  const [model, setModel] = useState("");
  useEffect(() => { try { const v = localStorage.getItem(MODEL_KEY); if (v) setModel(v); } catch { /* storage off */ } }, []);
  useEffect(() => {
    if (!loaded || !models.length) return;
    if (!models.some((m) => m.id === model)) setModel(defaultId && models.some((m) => m.id === defaultId) ? defaultId : models[0].id);
  }, [loaded, models, model, defaultId]);
  useEffect(() => { if (model) try { localStorage.setItem(MODEL_KEY, model); } catch { /* */ } }, [model]);
  return [model, setModel] as const;
}

const PROVIDER_LABEL: Record<string, string> = { inception: "Inception" };

export function ModelPicker({ models, value, onChange, checking, loaded, rechecking, onRecheck }: {
  models: ModelInfo[]; value: string; onChange: (id: string) => void;
  checking: boolean; loaded: boolean; rechecking: boolean; onRecheck: () => void;
}) {
  const groups = Array.from(new Set(models.map((m) => m.provider)));
  const btn = "grid size-10 flex-none place-items-center rounded-full border-1.5 border-line bg-cream-card text-plum-muted hover:border-frost-hot disabled:opacity-50";

  if (models.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex h-10 items-center gap-2 rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold text-plum-muted" role="status">
          {checking || !loaded ? <><Loader2 className="size-3.5 animate-spin" />checking which models are up…</> : "no models are responding right now"}
        </span>
        <button type="button" onClick={onRecheck} disabled={rechecking} aria-label="Re-check models" title="re-check which models are up" className={btn}>
          <RefreshCw className={cn("size-4", rechecking && "animate-spin")} />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <select value={models.some((m) => m.id === value) ? value : ""} onChange={(e) => onChange(e.target.value)} aria-label="Model"
        className="h-10 max-w-[260px] rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold outline-none focus:border-frost-hot">
        {groups.map((g) => (
          <optgroup key={g} label={PROVIDER_LABEL[g] ?? g}>
            {models.filter((m) => m.provider === g).map((m) => <option key={m.id} value={m.id}>{m.label}{m.vision ? " 👁" : ""}{m.tools ? " ⚙" : ""}</option>)}
          </optgroup>
        ))}
      </select>
      <button type="button" onClick={onRecheck} disabled={rechecking} aria-label="Re-check models" title="re-check which models are up (👁 reads images, ⚙ can run code)" className={btn}>
        <RefreshCw className={cn("size-4", rechecking && "animate-spin")} />
      </button>
    </div>
  );
}
