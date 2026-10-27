"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Lock, Send, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Model { id: string; label: string; vision: boolean }
interface Msg { role: "user" | "assistant"; content: string; images?: string[] }

const CODE_KEY = "shh:code";
const CONVO_KEY = "shh:convo";
const SYSTEM = "You are a sharp, helpful assistant. Answer clearly and concisely, and admit when you are unsure.";

// Build the OpenAI-style messages payload (string content, or an array with
// image_url parts when the user attached pictures).
function toApi(msgs: Msg[]) {
  const out: { role: string; content: unknown }[] = [{ role: "system", content: SYSTEM }];
  for (const m of msgs) {
    if (m.role === "user" && m.images?.length) {
      out.push({ role: "user", content: [{ type: "text", text: m.content || "" }, ...m.images.map((url) => ({ type: "image_url", image_url: { url } }))] });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

export function ShhChat() {
  const [code, setCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Restore an existing unlock + conversation.
  useEffect(() => {
    try {
      const c = localStorage.getItem(CODE_KEY);
      if (c) { setCode(c); }
      const saved = localStorage.getItem(CONVO_KEY);
      if (saved) setMsgs(JSON.parse(saved));
    } catch { /* storage off */ }
  }, []);

  // Load the model list once unlocked.
  useEffect(() => {
    if (!code) return;
    fetch(`/api/shh?code=${encodeURIComponent(code)}`).then((r) => r.json()).then((d) => {
      const list: Model[] = d.models ?? [];
      setModels(list);
      setModel((m) => m || d.default || list.find((x) => x.vision)?.id || list[0]?.id || "glm-5.3-flash");
    }).catch(() => {});
  }, [code]);

  useEffect(() => { try { localStorage.setItem(CONVO_KEY, JSON.stringify(msgs.slice(-40))); } catch { /* */ } }, [msgs]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const unlock = async () => {
    const c = codeInput.trim();
    if (!c || unlocking) return;
    setUnlocking(true);
    try {
      const r = await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "unlock", code: c }) });
      if (!r.ok) { toast("wrong code"); setUnlocking(false); return; }
      try { localStorage.setItem(CODE_KEY, c); } catch { /* */ }
      setCode(c);
    } catch { toast("couldn’t check that, try again"); }
    setUnlocking(false);
  };

  const attach = (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files).slice(0, 4)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 5 * 1024 * 1024) { toast("that image is a bit big (5MB max)"); continue; }
      const reader = new FileReader();
      reader.onload = () => { if (typeof reader.result === "string") setImages((im) => [...im, reader.result as string].slice(0, 4)); };
      reader.readAsDataURL(f);
    }
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !images.length) || busy || !code) return;
    const mine: Msg = { role: "user", content: text, images: images.length ? images : undefined };
    const next = [...msgs, mine];
    setMsgs(next);
    setInput("");
    setImages([]);
    setBusy(true);
    try {
      const r = await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "chat", code, model, messages: toApi(next) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.content) { setMsgs((m) => [...m, { role: "assistant", content: `⚠ ${d.error || "no answer"}` }]); }
      else setMsgs((m) => [...m, { role: "assistant", content: d.content }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "⚠ couldn’t reach the ai" }]);
    }
    setBusy(false);
  };

  // ---- locked ----
  if (!code) {
    return (
      <div className="mx-auto mt-10 flex max-w-[400px] flex-col items-center gap-4 rounded-shell border-1.5 border-line bg-cream-card p-8 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-cream-blush text-frost-text"><Lock className="size-7" /></div>
        <h2 className="text-xl font-extrabold tracking-[-.5px]">enter the code</h2>
        <input type="password" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && unlock()} autoFocus placeholder="••••••••"
          className="h-12 w-full rounded-full border-1.5 border-line bg-paper px-5 text-center text-[16px] font-bold tracking-[.2em] outline-none focus:border-frost-hot" />
        <button type="button" onClick={unlock} disabled={unlocking || !codeInput.trim()} className="grid h-11 w-full place-items-center rounded-full bg-frost font-extrabold text-frost-ink disabled:opacity-50">{unlocking ? <Loader2 className="size-4 animate-spin" /> : "unlock"}</button>
      </div>
    );
  }

  // ---- chat ----
  return (
    <div className="flex h-[calc(100svh-150px)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={model} onChange={(e) => setModel(e.target.value)} className="h-10 max-w-[260px] rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold outline-none focus:border-frost-hot">
          {models.length === 0 && <option value={model}>{model || "default"}</option>}
          {models.map((m) => <option key={m.id} value={m.id}>{m.id}{m.vision ? " 👁" : ""}</option>)}
        </select>
        <span className="flex-1" />
        {msgs.length > 0 && (
          <button type="button" onClick={() => { setMsgs([]); try { localStorage.removeItem(CONVO_KEY); } catch { /* */ } }} className="flex h-10 items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-3.5 text-[13px] font-bold text-plum-muted hover:border-frost-hot"><Trash2 className="size-3.5" />Clear</button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-shell border-1.5 border-line bg-cream-card p-3 sm:p-4">
        {msgs.length === 0 && (
          <div className="m-auto flex flex-col items-center gap-2 text-center text-plum-muted">
            <Sparkles className="size-7 text-frost-hot" />
            <p className="text-[14px] font-bold">ask anything. attach an image with a vision model (👁).</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-[14.5px] leading-relaxed", m.role === "user" ? "bg-frost text-frost-ink" : "bg-paper text-plum-body")}>
              {m.images?.length ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {m.images.map((src, n) => <img key={n} src={src} alt="" className="h-24 w-auto rounded-xl" />)}
                </div>
              ) : null}
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="rounded-3xl bg-paper px-4 py-3"><Loader2 className="size-4 animate-spin text-frost-hot" /></div></div>}
        <div ref={endRef} />
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((src, n) => (
            <div key={n} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="size-14 rounded-xl object-cover" />
              <button type="button" onClick={() => setImages((im) => im.filter((_, j) => j !== n))} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-black/80 text-white"><X className="size-3" strokeWidth={3} /></button>
            </div>
          ))}
        </div>
      )}

      {images.length > 0 && !models.find((m) => m.id === model)?.vision && (
        <p className="-mt-1 px-1 text-[12px] font-semibold text-plum-muted">this model can’t read images — pick a 👁 model (needs a vision-capable API key).</p>
      )}

      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { attach(e.target.files); e.target.value = ""; }} />
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach image" className="grid size-12 flex-none place-items-center rounded-full border-1.5 border-line bg-cream-card text-plum-body hover:border-frost-hot"><ImagePlus className="size-5" /></button>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder="message…"
          className="max-h-32 min-h-[48px] flex-1 resize-none rounded-3xl border-1.5 border-line bg-cream-card px-5 py-3 text-[15px] font-medium outline-none focus:border-frost-hot" />
        <button type="button" onClick={send} disabled={busy || (!input.trim() && !images.length)} className="grid size-12 flex-none place-items-center rounded-full bg-frost text-frost-ink disabled:opacity-50">{busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}</button>
      </div>
    </div>
  );
}
