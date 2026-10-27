"use client";
import * as D from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, FileText, Globe, ImagePlus, Loader2, Lock, Paperclip, RotateCw, Send, Settings2, Sparkles, Square, Terminal, Trash2, Upload, X } from "lucide-react";
import { OVERLAY, POPUP } from "@/components/ui/popup";
import { toast } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Model { id: string; label: string; vision: boolean }
interface Doc { name: string; content: string }
interface Step { language: string; code: string; output: string }
interface Msg { role: "user" | "assistant"; content: string; images?: string[]; docs?: Doc[]; steps?: Step[] }

const CODE_KEY = "shh:code";
const CONVO_KEY = "shh:convo";
const MODEL_KEY = "shh:model";
const SYSTEM = "You are a sharp, helpful assistant. Answer clearly and concisely, and admit when you are unsure. Use markdown and fenced code blocks where it helps.";

// OpenAI-style payload (string content, or an array with image_url parts).
// Attached files are folded into the user turn's text.
function toApi(msgs: Msg[]) {
  const out: { role: string; content: unknown }[] = [{ role: "system", content: SYSTEM }];
  for (const m of msgs) {
    if (m.role === "user") {
      const docText = m.docs?.length ? m.docs.map((d) => `\n\n--- file: ${d.name} ---\n${d.content}`).join("") : "";
      const text = (m.content || "") + docText;
      if (m.images?.length) out.push({ role: "user", content: [{ type: "text", text }, ...m.images.map((url) => ({ type: "image_url", image_url: { url } }))] });
      else out.push({ role: "user", content: text });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

const readImage = (f: File, add: (url: string) => void) => {
  if (!f.type.startsWith("image/")) return;
  if (f.size > 8 * 1024 * 1024) { toast("that image is a bit big (8MB max)"); return; }
  const reader = new FileReader();
  reader.onload = () => { if (typeof reader.result === "string") add(reader.result); };
  reader.readAsDataURL(f);
};

// Text-ish files we can read and hand to the model as context.
const TEXT_RE = /\.(txt|md|markdown|json|jsonl|csv|tsv|log|ya?ml|toml|ini|env|xml|html?|css|scss|js|jsx|ts|tsx|py|rb|go|rs|java|c|h|cpp|cs|php|sh|bash|sql|r|swift|kt|srt|vtt)$/i;
const readDoc = (f: File, add: (d: Doc) => void) => {
  if (f.type.startsWith("image/")) return;
  if (!(TEXT_RE.test(f.name) || f.type.startsWith("text/") || /json|xml|csv|javascript/.test(f.type))) { toast(`can't read ${f.name} — text files only`); return; }
  if (f.size > 1024 * 1024) { toast(`${f.name} is too big (1MB max)`); return; }
  const reader = new FileReader();
  reader.onload = () => { if (typeof reader.result === "string") add({ name: f.name, content: reader.result.slice(0, 200_000) }); };
  reader.readAsText(f);
};

// ---- tiny, safe markdown (no HTML injection): code fences, inline code, bold ----
function renderInline(s: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+?)\*\*/g;
  let last = 0, k = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) nodes.push(s.slice(last, m.index));
    if (m[1] != null) nodes.push(<code key={k++} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[12.5px]">{m[1]}</code>);
    else nodes.push(<strong key={k++}>{m[2]}</strong>);
    last = re.lastIndex;
  }
  if (last < s.length) nodes.push(s.slice(last));
  return nodes;
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative my-2">
      <button type="button" onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {})}
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20" aria-label="Copy code">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <pre className="overflow-x-auto rounded-xl bg-[#17101e] p-3 pr-10 text-[12.5px] leading-relaxed text-white"><code className="font-mono">{code}</code></pre>
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  const parts = text.split(/```/);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <CodeBlock key={i} code={p.replace(/^[\w+.-]*\n/, "")} /> : <span key={i} className="whitespace-pre-wrap">{renderInline(p)}</span>))}</>;
}

// Persistent setup: custom instructions / memory + reference files the assistant
// always has in context (stored server-side, keyed to the member).
function Setup({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [instr, setInstr] = useState("");
  const [sdocs, setSdocs] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => { fetch(`/api/shh?code=${encodeURIComponent(code)}`).then((r) => r.json()).then((d) => { setInstr(d.instructions || ""); setSdocs(d.docs || []); }).catch(() => {}); };

  const saveInstr = async () => {
    setSaving(true);
    try { await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "save_instructions", code, instructions: instr }) }); toast("saved ♡"); } catch { toast("couldn’t save"); }
    setSaving(false);
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      if (!(TEXT_RE.test(f.name) || f.type.startsWith("text/") || /json|xml|csv|javascript/.test(f.type))) { toast(`can't read ${f.name} — text files only`); continue; }
      if (f.size > 1024 * 1024) { toast(`${f.name} is too big (1MB max)`); continue; }
      const content = await f.text().catch(() => "");
      if (!content.trim()) continue;
      try {
        const r = await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "add_file", code, name: f.name, content: content.slice(0, 300_000) }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.id) setSdocs((x) => [...x, { id: j.id, name: j.name }]);
        else toast(j.error || "couldn’t add that");
      } catch { toast("upload failed"); }
    }
    setUploading(false);
  };

  const removeFile = async (id: string) => {
    setSdocs((x) => x.filter((d) => d.id !== id));
    try { await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "remove_file", code, id }) }); } catch { /* */ }
  };

  return (
    <D.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <D.Trigger asChild>
        <button type="button" aria-label="Setup" title="memory & reference files" className="flex h-10 items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-3.5 text-[13px] font-bold text-plum-muted hover:border-frost-hot"><Settings2 className="size-3.5" />Setup</button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className={OVERLAY} />
        <D.Content className={cn(POPUP, "fixed left-1/2 top-1/2 flex max-h-[85vh] w-[min(94vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-shell p-5")}>
          <D.Title className="text-[17px] font-extrabold">Memory & files</D.Title>
          <D.Description className="sr-only">Persistent instructions and reference files the assistant always uses</D.Description>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-extrabold">Instructions / memory</span>
            <span className="text-[12px] font-semibold text-plum-muted">Always applied — who it is, how it should answer, facts to remember.</span>
            <textarea value={instr} onChange={(e) => setInstr(e.target.value)} rows={5} maxLength={20000} placeholder="act as a patient tutor and always show your working…"
              className="resize-y rounded-2xl border-1.5 border-line bg-cream-card px-4 py-3 text-[14px] outline-none focus:border-frost-hot" />
            <button type="button" onClick={saveInstr} disabled={saving} className="self-end rounded-full bg-frost px-4 py-2 text-[13px] font-extrabold text-frost-ink disabled:opacity-50">{saving ? "saving…" : "Save"}</button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-extrabold">Reference files</span>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 rounded-full border-1.5 border-line px-3 py-1.5 text-[12.5px] font-bold hover:border-frost-hot disabled:opacity-50">{uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}Add files</button>
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </div>
            <span className="text-[12px] font-semibold text-plum-muted">Text/doc files it always has in context (max 30, 1MB each).</span>
            {sdocs.length === 0 ? (
              <p className="rounded-2xl border-1.5 border-dashed border-line bg-cream-card p-4 text-center text-[12.5px] font-semibold text-plum-muted">no files yet</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {sdocs.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 rounded-2xl border-1.5 border-line bg-cream-card px-3 py-2">
                    <FileText className="size-4 flex-none text-frost-text" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{d.name}</span>
                    <button type="button" onClick={() => removeFile(d.id)} aria-label="remove" className="text-plum-muted hover:text-frost-text"><X className="size-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
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
  const [docs, setDocs] = useState<Doc[]>([]);
  const [web, setWeb] = useState(false);
  const [exec, setExec] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const c = localStorage.getItem(CODE_KEY); if (c) setCode(c);
      const saved = localStorage.getItem(CONVO_KEY); if (saved) setMsgs(JSON.parse(saved));
      const mdl = localStorage.getItem(MODEL_KEY); if (mdl) setModel(mdl);
    } catch { /* storage off */ }
  }, []);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/shh?code=${encodeURIComponent(code)}`).then((r) => r.json()).then((d) => {
      const list: Model[] = d.models ?? [];
      setModels(list);
      setModel((m) => m || d.default || list.find((x) => x.vision)?.id || list[0]?.id || "glm-5.3-flash");
    }).catch(() => {});
  }, [code]);

  // Persist conversation (text only — base64 images would blow the storage
  // quota) and the chosen model. History itself is uncapped.
  useEffect(() => { try { localStorage.setItem(CONVO_KEY, JSON.stringify(msgs.map(({ role, content }) => ({ role, content })))); } catch { /* */ } }, [msgs]);
  useEffect(() => { if (model) try { localStorage.setItem(MODEL_KEY, model); } catch { /* */ } }, [model]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  // auto-grow the composer
  useEffect(() => { const ta = taRef.current; if (ta) { ta.style.height = "0px"; ta.style.height = Math.min(ta.scrollHeight, 200) + "px"; } }, [input]);

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

  const addImage = (url: string) => setImages((im) => [...im, url]);
  const addDoc = (d: Doc) => setDocs((x) => [...x, d]);

  // Send a given history to the model and append the reply. Used by send + regenerate.
  const ask = async (history: Msg[]) => {
    if (!code) return;
    setBusy(true);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const r = await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "chat", code, model, web, exec, messages: toApi(history) }), signal: ctl.signal });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.content) setMsgs((m) => [...m, { role: "assistant", content: `⚠ ${d.error || "no answer"}`, steps: d.steps }]);
      else setMsgs((m) => [...m, { role: "assistant", content: d.content, steps: d.steps }]);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsgs((m) => [...m, { role: "assistant", content: "⚠ couldn’t reach the ai" }]);
    }
    abortRef.current = null;
    setBusy(false);
  };

  const send = () => {
    const text = input.trim();
    if ((!text && !images.length && !docs.length) || busy || !code) return;
    const next = [...msgs, { role: "user" as const, content: text, images: images.length ? images : undefined, docs: docs.length ? docs : undefined }];
    setMsgs(next);
    setInput("");
    setImages([]);
    setDocs([]);
    ask(next);
  };

  const regenerate = () => {
    if (busy) return;
    // drop a trailing assistant message, re-ask from the conversation up to the last user turn
    let end = msgs.length;
    while (end > 0 && msgs[end - 1].role === "assistant") end--;
    if (end === 0) return;
    const history = msgs.slice(0, end);
    setMsgs(history);
    ask(history);
  };

  const stop = () => { abortRef.current?.abort(); };
  const copyText = (t: string) => navigator.clipboard?.writeText(t).then(() => toast("copied")).catch(() => {});

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

  const selVision = models.find((m) => m.id === model)?.vision;

  // ---- chat ----
  return (
    <div className="flex h-[calc(100svh-150px)] flex-col gap-3"
      onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); for (const f of Array.from(e.dataTransfer.files)) { readImage(f, addImage); readDoc(f, addDoc); } }}>
      <div className="flex flex-wrap items-center gap-2">
        <select value={model} onChange={(e) => setModel(e.target.value)} className="h-10 max-w-[260px] rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold outline-none focus:border-frost-hot">
          {models.length === 0 && <option value={model}>{model || "default"}</option>}
          {models.map((m) => <option key={m.id} value={m.id}>{m.id}{m.vision ? " 👁" : ""}</option>)}
        </select>
        <span className="flex-1" />
        <Setup code={code} />
        {msgs.length > 0 && (
          <button type="button" onClick={() => { setMsgs([]); try { localStorage.removeItem(CONVO_KEY); } catch { /* */ } }} className="flex h-10 items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-3.5 text-[13px] font-bold text-plum-muted hover:border-frost-hot"><Trash2 className="size-3.5" />Clear</button>
        )}
      </div>

      <div className={cn("relative flex flex-1 flex-col gap-3 overflow-y-auto rounded-shell border-1.5 bg-cream-card p-3 transition sm:p-4", dragging ? "border-frost-hot ring-2 ring-frost-hot/30" : "border-line")}>
        {dragging && <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-shell bg-cream-card/80 text-[15px] font-extrabold text-frost-text">drop a file ♡</div>}
        {msgs.length === 0 && (
          <div className="m-auto flex max-w-[360px] flex-col items-center gap-2 text-center text-plum-muted">
            <Sparkles className="size-7 text-frost-hot" />
            <p className="text-[14px] font-bold">ask anything. paste/drop an image (👁), attach a file, 🌐 to read links, or ▶ to let it run code.</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className="group flex max-w-[85%] flex-col gap-1">
              <div className={cn("rounded-3xl px-4 py-2.5 text-[14.5px] leading-relaxed", m.role === "user" ? "whitespace-pre-wrap break-words bg-frost text-frost-ink" : "break-words bg-paper text-plum-body")}>
                {m.images?.length ? (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {m.images.map((src, n) => <img key={n} src={src} alt="" className="h-24 w-auto rounded-xl" />)}
                  </div>
                ) : null}
                {m.docs?.length ? (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {m.docs.map((d, n) => <span key={n} className="flex items-center gap-1 rounded-lg bg-black/10 px-2 py-1 text-[11.5px] font-bold"><FileText className="size-3" />{d.name}</span>)}
                  </div>
                ) : null}
                {m.role === "assistant" && m.steps?.length ? (
                  <div className="mb-2 flex flex-col gap-2">
                    {m.steps.map((s, si) => (
                      <div key={si}>
                        <div className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-plum-muted"><Terminal className="size-3" />ran {s.language || "code"}</div>
                        <CodeBlock code={s.code} />
                        <pre className="mt-1 overflow-x-auto rounded-xl border-1.5 border-line bg-black/5 p-2.5 text-[12px] leading-relaxed"><code className="font-mono">{s.output}</code></pre>
                      </div>
                    ))}
                  </div>
                ) : null}
                {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
              </div>
              {m.role === "assistant" && m.content && (
                <div className="flex gap-1 px-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                  <button type="button" onClick={() => copyText(m.content)} className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11.5px] font-bold text-plum-muted hover:text-frost-text"><Copy className="size-3" />copy</button>
                  {i === msgs.length - 1 && !busy && <button type="button" onClick={regenerate} className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11.5px] font-bold text-plum-muted hover:text-frost-text"><RotateCw className="size-3" />regenerate</button>}
                </div>
              )}
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

      {images.length > 0 && !selVision && (
        <p className="-mt-1 px-1 text-[12px] font-semibold text-plum-muted">this model can’t read images — pick a 👁 model.</p>
      )}

      {docs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {docs.map((d, n) => (
            <span key={n} className="flex items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card py-1.5 pl-3 pr-2 text-[12px] font-bold">
              <FileText className="size-3.5 text-frost-text" />{d.name}
              <button type="button" onClick={() => setDocs((x) => x.filter((_, j) => j !== n))} aria-label="remove" className="grid size-4 place-items-center rounded-full text-plum-muted hover:text-frost-text"><X className="size-3" strokeWidth={3} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { for (const f of Array.from(e.target.files ?? [])) readImage(f, addImage); e.target.value = ""; }} />
        <input ref={docRef} type="file" multiple hidden onChange={(e) => { for (const f of Array.from(e.target.files ?? [])) readDoc(f, addDoc); e.target.value = ""; }} />
        <div className="flex flex-none gap-1">
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach image" title="attach image" className="grid size-11 place-items-center rounded-full border-1.5 border-line bg-cream-card text-plum-body hover:border-frost-hot"><ImagePlus className="size-5" /></button>
          <button type="button" onClick={() => docRef.current?.click()} aria-label="Attach file" title="attach a text / doc file" className="grid size-11 place-items-center rounded-full border-1.5 border-line bg-cream-card text-plum-body hover:border-frost-hot"><Paperclip className="size-[18px]" /></button>
          <button type="button" onClick={() => setWeb((w) => !w)} aria-pressed={web} title="look things up on the web (reads links; search needs a z.ai web package)" className={cn("grid size-11 place-items-center rounded-full border-1.5 transition", web ? "border-frost-hot bg-cream-blush text-frost-text" : "border-line bg-cream-card text-plum-body hover:border-frost-hot")}><Globe className="size-5" /></button>
          <button type="button" onClick={() => setExec((x) => !x)} aria-pressed={exec} title="let it run code in a sandbox" className={cn("grid size-11 place-items-center rounded-full border-1.5 transition", exec ? "border-frost-hot bg-cream-blush text-frost-text" : "border-line bg-cream-card text-plum-body hover:border-frost-hot")}><Terminal className="size-5" /></button>
        </div>
        <textarea ref={taRef} value={input} onChange={(e) => setInput(e.target.value)}
          onPaste={(e) => { const imgs = Array.from(e.clipboardData.items).filter((it) => it.type.startsWith("image/")); if (imgs.length) { e.preventDefault(); for (const it of imgs) { const f = it.getAsFile(); if (f) readImage(f, addImage); } } }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder={web ? "ask — i’ll look it up…" : "message…  (paste an image, or attach a file)"}
          className="max-h-[200px] min-h-[48px] flex-1 resize-none rounded-3xl border-1.5 border-line bg-cream-card px-5 py-3 text-[15px] font-medium outline-none focus:border-frost-hot" />
        {busy ? (
          <button type="button" onClick={stop} aria-label="Stop" className="grid size-12 flex-none place-items-center rounded-full border-1.5 border-line bg-cream-card text-frost-text hover:border-frost-hot"><Square className="size-4" fill="currentColor" /></button>
        ) : (
          <button type="button" onClick={send} disabled={!input.trim() && !images.length && !docs.length} className="grid size-12 flex-none place-items-center rounded-full bg-frost text-frost-ink disabled:opacity-50"><Send className="size-5" /></button>
        )}
      </div>
    </div>
  );
}
