"use client";
import "katex/dist/katex.min.css";
import * as D from "@radix-ui/react-dialog";
import * as DM from "@radix-ui/react-dropdown-menu";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Brain, Check, ChevronDown, Copy, Drama, EyeOff, Feather, FileText, Globe, ImagePlus, Link2, Loader2, Lock, LogOut, MessageSquarePlus, Paperclip, Pencil, RotateCw, Search, Send, Settings2, Sliders, Sparkles, Square, Terminal, Trash2, Upload, Users, X } from "lucide-react";
import { OVERLAY, POPUP } from "@/components/ui/popup";
import { Decoy, DECOY_SKINS, type DecoyConfig } from "@/components/shh/decoy";
import { DEFAULT_HUM, HumanizeDialog, humanizeRequest, loadHumPrefs, loadVoice, type HumPrefs } from "@/components/shh/humanizer";
import { toast } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Model { id: string; label: string; vision: boolean }
interface Doc { name: string; content: string }
interface Step { id: string; name?: string; language?: string; code?: string; query?: string; url?: string; output?: string; status?: "running" | "done" }
interface Msg { role: "user" | "assistant"; content: string; images?: string[]; docs?: Doc[]; steps?: Step[]; memories?: string[]; pending?: boolean; orig?: string }
interface Thread { id: string; title: string; updatedAt: number }
interface Prefs { hideFooter: boolean; hideHeader: boolean; bossKey: boolean; bossKeys: string[]; disguise: string; customTitle: string; decoy: string; decoyConfig: DecoyConfig; antiFlip: boolean; antiFlipTarget: string; antiFlipCustom: string }
interface RoomMsg { id: number; handle: string | null; role: string; content: string; steps?: Step[] }

const CODE_KEY = "shh:code";
const MODEL_KEY = "shh:model";
const THREADS_KEY = "shh:threads";
const ACTIVE_KEY = "shh:active";
const PREFS_KEY = "shh:prefs";
const OLD_CONVO_KEY = "shh:convo";
const threadKey = (id: string) => `shh:thread:${id}`;
const SYSTEM = "You are a sharp, helpful assistant. Answer clearly and concisely, and admit when you are unsure. Use markdown and fenced code blocks where it helps, and LaTeX ($…$ or $$…$$) for math.";

const DEFAULT_PREFS: Prefs = { hideFooter: false, hideHeader: false, bossKey: true, bossKeys: ["`"], disguise: "off", customTitle: "", decoy: "word", decoyConfig: {}, antiFlip: false, antiFlipTarget: "docs", antiFlipCustom: "" };
const keyLabel = (k: string) => (k === " " ? "Space" : k.length === 1 ? k.toUpperCase() : k);
const DISGUISES: Record<string, { title: string; emoji: string }> = {
  docs: { title: "Untitled document - Google Docs", emoji: "📝" },
  sheets: { title: "Untitled spreadsheet - Google Sheets", emoji: "📊" },
  slides: { title: "Untitled presentation - Google Slides", emoji: "📽️" },
  classroom: { title: "Classes", emoji: "🎓" },
  drive: { title: "My Drive - Google Drive", emoji: "📁" },
  mail: { title: "Inbox - Gmail", emoji: "✉️" },
};

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

// Big images as raw base64 blow past the API's request limits (the old "Invalid
// API parameter" failure), so downscale and re-encode as JPEG. If the first pass
// is still heavy, squeeze again — a readable page beats a failed turn.
function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const render = (max: number, q: number): string => {
        let { width, height } = img;
        if (!width || !height) return dataUrl;
        if (width > max || height > max) { const s = max / Math.max(width, height); width = Math.round(width * s); height = Math.round(height * s); }
        try {
          const c = document.createElement("canvas");
          c.width = width; c.height = height;
          const ctx = c.getContext("2d");
          if (!ctx) return dataUrl;
          ctx.drawImage(img, 0, 0, width, height);
          return c.toDataURL("image/jpeg", q);
        } catch { return dataUrl; }
      };
      let out = render(1500, 0.82);
      if (out.length > 1_400_000) out = render(1100, 0.72); // still huge → squeeze harder
      if (out.length > 1_400_000) out = render(820, 0.68);
      resolve(out);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

const readImage = (f: File, add: (url: string) => void) => {
  if (!f.type.startsWith("image/")) return;
  if (f.size > 25 * 1024 * 1024) { toast("that image is huge (25MB max)"); return; }
  const reader = new FileReader();
  reader.onload = async () => { if (typeof reader.result === "string") add(await compressImage(reader.result)); };
  reader.readAsDataURL(f);
};

// Text-ish files we can read and hand to the model as context.
const TEXT_RE = /\.(txt|md|markdown|json|jsonl|csv|tsv|log|ya?ml|toml|ini|env|xml|html?|css|scss|js|jsx|ts|tsx|py|rb|go|rs|java|c|h|cpp|cs|php|sh|bash|sql|r|swift|kt|srt|vtt)$/i;
const readableDoc = (f: File) => TEXT_RE.test(f.name) || f.type.startsWith("text/") || /json|xml|csv|javascript/.test(f.type);
const readDoc = (f: File, add: (d: Doc) => void) => {
  if (f.type.startsWith("image/")) return;
  if (!readableDoc(f)) { toast(`can't read ${f.name} — text files only`); return; }
  if (f.size > 1024 * 1024) { toast(`${f.name} is too big (1MB max)`); return; }
  const reader = new FileReader();
  reader.onload = () => { if (typeof reader.result === "string") add({ name: f.name, content: reader.result.slice(0, 200_000) }); };
  reader.readAsText(f);
};

// ---- markdown (gfm + math), with a copy button on code blocks ----
const MD_CSS = `
.shh-md{line-height:1.6;word-break:break-word}
.shh-md > :first-child{margin-top:0}
.shh-md > :last-child{margin-bottom:0}
.shh-md p{margin:.5em 0}
.shh-md h1,.shh-md h2,.shh-md h3,.shh-md h4{font-weight:800;line-height:1.25;margin:.85em 0 .35em}
.shh-md h1{font-size:1.32em}.shh-md h2{font-size:1.16em}.shh-md h3{font-size:1.05em}
.shh-md ul,.shh-md ol{margin:.4em 0;padding-left:1.45em}
.shh-md ul{list-style:disc}.shh-md ol{list-style:decimal}
.shh-md li{margin:.2em 0}
.shh-md li>ul,.shh-md li>ol{margin:.2em 0}
.shh-md a{color:var(--color-frost-text,#bd4b86);text-decoration:underline;text-underline-offset:2px}
.shh-md code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:rgba(0,0,0,.08);padding:.12em .34em;border-radius:.35em}
.shh-md table{border-collapse:collapse;margin:.6em 0;display:block;max-width:100%;overflow-x:auto}
.shh-md th,.shh-md td{border:1px solid rgba(0,0,0,.14);padding:.32em .6em;text-align:left;font-size:.95em}
.shh-md th{background:rgba(0,0,0,.05);font-weight:700}
.shh-md blockquote{border-left:3px solid rgba(0,0,0,.18);padding-left:.8em;margin:.5em 0;opacity:.85}
.shh-md hr{border:0;border-top:1px solid rgba(0,0,0,.14);margin:.8em 0}
.shh-md .katex-display{margin:.5em 0;overflow-x:auto;overflow-y:hidden;padding:2px 0}
`;

function CodePre({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = () => { const t = ref.current?.innerText ?? ""; navigator.clipboard?.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {}); };
  return (
    <div className="relative my-2">
      <button type="button" onClick={copy} className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20" aria-label="Copy code">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <pre ref={ref} className="overflow-x-auto rounded-xl bg-[#17101e] p-3 pr-10 text-[12.5px] leading-relaxed text-white [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-white">{children}</pre>
    </div>
  );
}
const MD_COMPONENTS = {
  pre: CodePre,
  a: (props: React.ComponentProps<"a">) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};
function Markdown({ text }: { text: string }) {
  return (
    <div className="shh-md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={MD_COMPONENTS}>{text}</ReactMarkdown>
    </div>
  );
}

function PlainCodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {})}
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20" aria-label="Copy code">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <pre className="overflow-x-auto rounded-xl bg-[#17101e] p-3 pr-10 text-[12.5px] leading-relaxed text-white"><code className="font-mono">{code}</code></pre>
    </div>
  );
}

// One tool step the model ran (code / web search / url read).
function ToolStep({ s }: { s: Step }) {
  const label = s.name === "web_search" ? `searched the web` : s.name === "read_url" ? `read a page` : `ran ${s.language || "code"}`;
  const Icon = s.name === "web_search" ? Search : s.name === "read_url" ? Globe : Terminal;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-plum-muted">
        <Icon className="size-3" />{label}{s.status === "running" && <Loader2 className="size-3 animate-spin" />}
      </div>
      {s.code ? <PlainCodeBlock code={s.code} /> : null}
      {s.query ? <p className="text-[12.5px] font-semibold text-plum-body">“{s.query}”</p> : null}
      {s.url ? <p className="truncate text-[12px] font-semibold text-frost-text">{s.url}</p> : null}
      {s.output != null && s.status === "done" ? (
        <pre className="mt-1 max-h-48 overflow-auto rounded-xl border-1.5 border-line bg-black/5 p-2.5 text-[12px] leading-relaxed"><code className="font-mono whitespace-pre-wrap">{s.output.slice(0, 2000)}</code></pre>
      ) : null}
    </div>
  );
}

// ---- persistent setup: memory + reference files (server-side, per member) ----
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
      if (!readableDoc(f)) { toast(`can't read ${f.name} — text files only`); continue; }
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
            <span className="text-[12px] font-semibold text-plum-muted">Always applied — who it is, how it should answer, facts to remember. (It can add its own with the 🧠 remember tool.)</span>
            <textarea value={instr} onChange={(e) => setInstr(e.target.value)} rows={6} maxLength={20000} placeholder="act as a patient tutor and always show your working…"
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

// ---- appearance / stealth toggles (client-only, per device) ----
const row = "flex items-center justify-between gap-3 rounded-2xl border-1.5 border-line bg-cream-card px-4 py-3";
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} className={cn("relative h-6 w-11 flex-none rounded-full transition", on ? "bg-frost" : "bg-line")}>
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}
function Customize({ prefs, setPrefs }: { prefs: Prefs; setPrefs: (p: Prefs) => void }) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Prefs>) => setPrefs({ ...prefs, ...patch });
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger asChild>
        <button type="button" aria-label="Customize" title="appearance & stealth" className="flex h-10 items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-3.5 text-[13px] font-bold text-plum-muted hover:border-frost-hot"><Sliders className="size-3.5" />Customize</button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className={OVERLAY} />
        <D.Content className={cn(POPUP, "fixed left-1/2 top-1/2 flex max-h-[85vh] w-[min(94vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-shell p-5")}>
          <D.Title className="text-[17px] font-extrabold">Customize</D.Title>
          <D.Description className="sr-only">Appearance and stealth options for this tab</D.Description>
          <div className={row}>
            <div><div className="text-[13.5px] font-extrabold">Hide the footer</div><div className="text-[12px] font-semibold text-plum-muted">remove the cupcake.gg footer on this tab</div></div>
            <Toggle on={prefs.hideFooter} onClick={() => set({ hideFooter: !prefs.hideFooter })} />
          </div>
          <div className={row}>
            <div><div className="text-[13.5px] font-extrabold">Hide the header</div><div className="text-[12px] font-semibold text-plum-muted">hide the top nav bar too — distraction free</div></div>
            <Toggle on={prefs.hideHeader} onClick={() => set({ hideHeader: !prefs.hideHeader })} />
          </div>
          <div className="flex flex-col gap-2 rounded-2xl border-1.5 border-line bg-cream-card px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-[13.5px] font-extrabold">Boss key(s)</div><div className="text-[12px] font-semibold text-plum-muted">press any set key to instantly throw up the decoy; press it again, <kbd className="rounded bg-black/10 px-1 font-mono">Esc</kbd>, or click the top-left icon to come back</div></div>
              <Toggle on={prefs.bossKey} onClick={() => set({ bossKey: !prefs.bossKey })} />
            </div>
            {prefs.bossKey && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {prefs.bossKeys.length === 0 && <span className="text-[12px] font-semibold text-plum-muted">no keys set</span>}
                  {prefs.bossKeys.map((k) => (
                    <span key={k} className="flex items-center gap-1 rounded-lg bg-cream-blush px-2 py-1 text-[12px] font-bold text-frost-text">
                      <kbd className="font-mono">{keyLabel(k)}</kbd>
                      <button type="button" onClick={() => set({ bossKeys: prefs.bossKeys.filter((x) => x !== k) })} aria-label="remove"><X className="size-3" /></button>
                    </span>
                  ))}
                </div>
                <input readOnly placeholder="click here, then press a key to add it…"
                  onKeyDown={(e) => { e.preventDefault(); const k = e.key; if (k === "Escape" || k === "Tab" || k === "Enter") return; if (!prefs.bossKeys.includes(k)) set({ bossKeys: [...prefs.bossKeys, k] }); }}
                  className="h-10 rounded-full border-1.5 border-line bg-paper px-4 text-[13px] font-semibold outline-none focus:border-frost-hot" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 rounded-2xl border-1.5 border-line bg-cream-card px-4 py-3">
            <div className="text-[13.5px] font-extrabold">Decoy screen</div>
            <div className="text-[12px] font-semibold text-plum-muted">what the Hide button and boss key show — a full-screen cover that looks like schoolwork. the chat stays exactly where you left it underneath.</div>
            <div className="flex flex-wrap gap-1.5">
              {DECOY_SKINS.map((s) => (
                <button key={s.id} type="button" onClick={() => set({ decoy: s.id })} className={cn("rounded-full border-1.5 px-3 py-1.5 text-[12.5px] font-bold", prefs.decoy === s.id ? "border-frost-hot bg-cream-blush text-frost-text" : "border-line hover:border-frost-hot")}>{s.label}</button>
              ))}
            </div>
          </div>
          {(() => {
            const cfg = prefs.decoyConfig || {};
            const setCfg = (patch: Partial<DecoyConfig>) => set({ decoyConfig: { ...cfg, ...patch } });
            const inp = "rounded-xl border-1.5 border-line bg-paper px-3 py-2 text-[13px] font-semibold outline-none focus:border-frost-hot";
            const grp = "mt-1.5 text-[12px] font-extrabold text-frost-text";
            return (
              <div className="flex flex-col gap-1.5 rounded-2xl border-1.5 border-line bg-cream-card px-4 py-3">
                <div className="text-[13.5px] font-extrabold">Decoy content</div>
                <div className="text-[12px] font-semibold text-plum-muted">make the cover say whatever matches your real work. leave blank for the default sample.</div>
                <span className={grp}>Word</span>
                <input className={inp} value={cfg.wordTitle ?? ""} onChange={(e) => setCfg({ wordTitle: e.target.value })} placeholder="file name (also the tab), e.g. Essay_Draft" />
                <input className={inp} value={cfg.wordHeading ?? ""} onChange={(e) => setCfg({ wordHeading: e.target.value })} placeholder="document heading" />
                <textarea className={cn(inp, "resize-y")} rows={3} value={cfg.wordBody ?? ""} onChange={(e) => setCfg({ wordBody: e.target.value })} placeholder="body text (blank line = new paragraph)" />
                <span className={grp}>Excel</span>
                <div className="flex gap-1.5"><input className={cn(inp, "flex-1")} value={cfg.excelTitle ?? ""} onChange={(e) => setCfg({ excelTitle: e.target.value })} placeholder="workbook, e.g. Book1" /><input className={cn(inp, "w-32")} value={cfg.excelSheet ?? ""} onChange={(e) => setCfg({ excelSheet: e.target.value })} placeholder="Sheet1" /></div>
                <span className={grp}>W3Schools</span>
                <input className={inp} value={cfg.w3Title ?? ""} onChange={(e) => setCfg({ w3Title: e.target.value })} placeholder="page title, e.g. HTML Introduction" />
                <span className={grp}>Reading Plus</span>
                <div className="flex gap-1.5"><input className={cn(inp, "flex-1")} value={cfg.rpTitle ?? ""} onChange={(e) => setCfg({ rpTitle: e.target.value })} placeholder="selection title" /><input className={cn(inp, "w-28")} value={cfg.rpLevel ?? ""} onChange={(e) => setCfg({ rpLevel: e.target.value })} placeholder="Level J" /></div>
                <textarea className={cn(inp, "resize-y")} rows={3} value={cfg.rpBody ?? ""} onChange={(e) => setCfg({ rpBody: e.target.value })} placeholder="passage text (blank line = new paragraph)" />
              </div>
            );
          })()}
          <div className="flex flex-col gap-2 rounded-2xl border-1.5 border-line bg-cream-card px-4 py-3">
            <div className="text-[13.5px] font-extrabold">Disguise the tab</div>
            <div className="text-[12px] font-semibold text-plum-muted">spoof the tab title and icon so it blends in</div>
            <div className="flex flex-wrap gap-1.5">
              {["off", ...Object.keys(DISGUISES), "custom"].map((k) => (
                <button key={k} type="button" onClick={() => set({ disguise: k })} className={cn("rounded-full border-1.5 px-3 py-1.5 text-[12.5px] font-bold capitalize", prefs.disguise === k ? "border-frost-hot bg-cream-blush text-frost-text" : "border-line hover:border-frost-hot")}>
                  {k === "off" ? "off" : k === "custom" ? "custom…" : DISGUISES[k].title.split(" - ")[1] || k}
                </button>
              ))}
            </div>
            {prefs.disguise === "custom" && (
              <input value={prefs.customTitle} onChange={(e) => set({ customTitle: e.target.value })} placeholder="tab title to show…" className="mt-1 h-10 rounded-full border-1.5 border-line bg-paper px-4 text-[13px] font-semibold outline-none focus:border-frost-hot" />
            )}
          </div>
          <div className="flex flex-col gap-2 rounded-2xl border-1.5 border-line bg-cream-card px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-[13.5px] font-extrabold">Anti-flip</div><div className="text-[12px] font-semibold text-plum-muted">the instant you click away, swap the tab title + icon to a disguise so it never flashes what it really is; switches back when you return. (browsers can’t read your other tabs, so you pick the mask.)</div></div>
              <Toggle on={prefs.antiFlip} onClick={() => set({ antiFlip: !prefs.antiFlip })} />
            </div>
            {prefs.antiFlip && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {[...Object.keys(DISGUISES), "custom"].map((k) => (
                    <button key={k} type="button" onClick={() => set({ antiFlipTarget: k })} className={cn("rounded-full border-1.5 px-3 py-1.5 text-[12.5px] font-bold capitalize", prefs.antiFlipTarget === k ? "border-frost-hot bg-cream-blush text-frost-text" : "border-line hover:border-frost-hot")}>{k === "custom" ? "custom…" : DISGUISES[k].title.split(" - ")[1] || k}</button>
                  ))}
                </div>
                {prefs.antiFlipTarget === "custom" && (
                  <input value={prefs.antiFlipCustom} onChange={(e) => set({ antiFlipCustom: e.target.value })} placeholder="tab title to show when you tab away…" className="h-10 rounded-full border-1.5 border-line bg-paper px-4 text-[13px] font-semibold outline-none focus:border-frost-hot" />
                )}
              </>
            )}
          </div>
          <p className="text-[11.5px] font-semibold text-plum-muted">these are saved on this device only.</p>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// Swap the tab title + favicon when a disguise is on; restore on change/unmount.
function setFavicon(emoji: string | null) {
  let link = document.querySelector<HTMLLinkElement>("link[data-shh-fav]");
  if (!emoji) { link?.remove(); return; }
  if (!link) { link = document.createElement("link"); link.rel = "icon"; link.setAttribute("data-shh-fav", "1"); document.head.appendChild(link); }
  link.href = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`)}`;
}

export function ShhChat({ me }: { me?: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [web, setWeb] = useState(false);
  const [exec, setExec] = useState(false);
  const [natural, setNatural] = useState(false);            // write replies in a natural human voice from the start
  const [hum, setHumState] = useState<HumPrefs>(DEFAULT_HUM);  // strength + voice for the Humanize tool
  const [humBusy, setHumBusy] = useState<number | null>(null); // index of the reply being rewritten
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [cover, setCover] = useState<string | null>(null);
  const [room, setRoom] = useState<{ id: string; title: string } | null>(null);
  const [roomMsgs, setRoomMsgs] = useState<RoomMsg[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [roomBusy, setRoomBusy] = useState(false);
  const lastRoomId = useRef(0);
  const autoJoined = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadedThread = useRef(false);

  // ---- boot: code, model, threads (migrating the old single convo), prefs ----
  useEffect(() => {
    try {
      const c = localStorage.getItem(CODE_KEY); if (c) setCode(c);
      const mdl = localStorage.getItem(MODEL_KEY); if (mdl) setModel(mdl);
      const p = localStorage.getItem(PREFS_KEY); if (p) setPrefsState({ ...DEFAULT_PREFS, ...JSON.parse(p) });
      let list: Thread[] = [];
      try { list = JSON.parse(localStorage.getItem(THREADS_KEY) || "[]"); } catch { list = []; }
      if (!Array.isArray(list) || !list.length) {
        const id = crypto.randomUUID();
        let seed: Msg[] = [];
        try { const old = localStorage.getItem(OLD_CONVO_KEY); if (old) seed = JSON.parse(old); } catch { /* */ }
        list = [{ id, title: seed.find((m) => m.role === "user")?.content?.slice(0, 40) || "new chat", updatedAt: Date.now() }];
        try { localStorage.setItem(threadKey(id), JSON.stringify(seed)); localStorage.setItem(THREADS_KEY, JSON.stringify(list)); localStorage.removeItem(OLD_CONVO_KEY); } catch { /* */ }
      }
      setThreads(list);
      const active = localStorage.getItem(ACTIVE_KEY) || list[0].id;
      setActiveId(list.some((t) => t.id === active) ? active : list[0].id);
    } catch { /* storage off */ }
  }, []);

  // load a thread's messages when the active thread changes
  useEffect(() => {
    if (!activeId) return;
    loadedThread.current = false;
    try { const raw = localStorage.getItem(threadKey(activeId)); setMsgs(raw ? JSON.parse(raw) : []); } catch { setMsgs([]); }
    loadedThread.current = true;
    try { localStorage.setItem(ACTIVE_KEY, activeId); } catch { /* */ }
  }, [activeId]);

  // persist the active thread's messages (with images; degrade on quota).
  // Debounced, so a long streamed answer doesn't rewrite storage per token.
  useEffect(() => {
    if (!activeId || !loadedThread.current) return;
    const key = threadKey(activeId);
    const t = setTimeout(() => {
      const save = (data: unknown) => { try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { return false; } };
      if (!save(msgs)) {
        if (!save(msgs.map((m, i) => (i >= msgs.length - 6 ? m : { ...m, images: undefined, docs: m.docs?.map((d) => ({ name: d.name, content: "" })) })))) {
          save(msgs.map(({ role, content, steps }) => ({ role, content, steps })));
        }
      }
      setThreads((ts) => {
        const first = msgs.find((m) => m.role === "user")?.content?.trim();
        const next = ts.map((x) => (x.id === activeId ? { ...x, updatedAt: Date.now(), title: first ? first.slice(0, 40) : x.title } : x));
        try { localStorage.setItem(THREADS_KEY, JSON.stringify(next)); } catch { /* */ }
        return next;
      });
    }, 500);
    return () => clearTimeout(t);
  }, [msgs, activeId]);

  useEffect(() => { if (model) try { localStorage.setItem(MODEL_KEY, model); } catch { /* */ } }, [model]);
  useEffect(() => { setHumState(loadHumPrefs()); try { setNatural(localStorage.getItem("shh:natural") === "1"); } catch { /* */ } }, []);
  const setHum = (p: HumPrefs) => { setHumState(p); try { localStorage.setItem("shh:hum", JSON.stringify(p)); } catch { /* */ } };
  const toggleNatural = () => setNatural((n) => { const v = !n; try { localStorage.setItem("shh:natural", v ? "1" : "0"); } catch { /* */ } return v; });
  const setPrefs = (p: Prefs) => { setPrefsState(p); try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* */ } };

  useEffect(() => {
    if (!code) return;
    fetch(`/api/shh?code=${encodeURIComponent(code)}`).then((r) => r.json()).then((d) => {
      const list: Model[] = d.models ?? [];
      setModels(list);
      setModel((m) => m || d.default || list.find((x) => x.vision)?.id || list[0]?.id || "glm-5.3-flash");
    }).catch(() => {});
  }, [code]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy, roomMsgs, roomBusy]);
  useEffect(() => { const ta = taRef.current; if (ta) { ta.style.height = "0px"; ta.style.height = Math.min(ta.scrollHeight, 200) + "px"; } }, [input]);

  // apply chrome prefs (hide header/footer) via one injected stylesheet
  useEffect(() => {
    const id = "shh-chrome-style";
    let el = document.getElementById(id) as HTMLStyleElement | null;
    const rules = [prefs.hideFooter && "footer{display:none!important}", prefs.hideHeader && "header{display:none!important}"].filter(Boolean).join("");
    if (rules) { if (!el) { el = document.createElement("style"); el.id = id; document.head.appendChild(el); } el.textContent = rules; }
    else el?.remove();
    return () => { document.getElementById(id)?.remove(); };
  }, [prefs.hideFooter, prefs.hideHeader]);

  // tab look: the static disguise when active, and (anti-flip) a mask the instant
  // the tab loses focus, so it never flashes the real title/icon when you tab away.
  useEffect(() => {
    const original = document.title;
    const maskTo = (target: string, custom: string) => {
      if (target === "custom") { if (custom.trim()) document.title = custom.trim(); setFavicon("📄"); }
      else if (DISGUISES[target]) { document.title = DISGUISES[target].title; setFavicon(DISGUISES[target].emoji); }
    };
    const activeLook = () => {
      const d = prefs.disguise;
      if (d === "off") { document.title = original; setFavicon(null); }
      else maskTo(d, prefs.customTitle);
    };
    const render = (away: boolean) => {
      if (away && prefs.antiFlip) maskTo(prefs.antiFlipTarget, prefs.antiFlipCustom);
      else activeLook();
    };
    render(document.visibilityState === "hidden");
    const onVis = () => render(document.visibilityState === "hidden");
    const onBlur = () => render(true);
    const onFocus = () => render(false);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => { document.title = original; setFavicon(null); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("blur", onBlur); window.removeEventListener("focus", onFocus); };
  }, [prefs.disguise, prefs.customTitle, prefs.antiFlip, prefs.antiFlipTarget, prefs.antiFlipCustom]);

  // boss key(s): any configured key throws up (or lifts) the decoy instantly
  useEffect(() => {
    if (!prefs.bossKey || !prefs.bossKeys.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (!prefs.bossKeys.includes(e.key)) return;
      if ((e.target as HTMLElement)?.closest("input,textarea,[contenteditable='true']")) return;
      e.preventDefault();
      setCover((c) => (c ? null : prefs.decoy || "blank"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prefs.bossKey, prefs.bossKeys, prefs.decoy]);

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

  // stream a reply for the given history, updating the trailing assistant msg live
  const ask = async (history: Msg[], modelOverride?: string) => {
    if (!code) return;
    setBusy(true);
    const ctl = new AbortController();
    abortRef.current = ctl;
    setMsgs((m) => [...m, { role: "assistant", content: "", steps: [], pending: true }]);
    const patch = (fn: (a: Msg) => Msg) => setMsgs((m) => { if (!m.length) return m; const c = [...m]; const i = c.length - 1; if (c[i].role === "assistant") c[i] = fn(c[i]); return c; });
    try {
      const r = await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "chat", code, model: modelOverride || model, web, exec, humanize: natural, tone: hum.tone, messages: toApi(history) }), signal: ctl.signal });
      if (!r.ok || !r.body) { const d = await r.json().catch(() => ({})); patch((a) => ({ ...a, content: `⚠ ${d.error || "no answer"}`, pending: false })); abortRef.current = null; setBusy(false); return; }
      const reader = r.body.getReader();
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
          if (!line) continue;
          let ev: any; // eslint-disable-line @typescript-eslint/no-explicit-any
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.k === "d") patch((a) => ({ ...a, content: a.content + ev.v, pending: false }));
          else if (ev.k === "tool") patch((a) => {
            const steps = [...(a.steps || [])];
            const idx = steps.findIndex((s) => s.id === ev.id);
            const merged = { ...(idx >= 0 ? steps[idx] : { id: ev.id }), ...ev } as Step;
            if (idx >= 0) steps[idx] = merged; else steps.push(merged);
            return { ...a, steps, pending: false };
          });
          else if (ev.k === "mem") patch((a) => ({ ...a, memories: [...(a.memories || []), ev.v] }));
          else if (ev.k === "err") patch((a) => ({ ...a, content: (a.content ? a.content + "\n\n" : "") + `⚠ ${ev.v}`, pending: false }));
        }
      }
      patch((a) => ({ ...a, pending: false }));
    } catch (e) {
      if ((e as Error).name !== "AbortError") patch((a) => ({ ...a, content: (a.content ? a.content + "\n\n" : "") + "⚠ couldn’t reach the ai", pending: false }));
      else patch((a) => ({ ...a, pending: false }));
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
    // images need a vision model — switch automatically if the current one can't see
    let useModel = model;
    if (images.length && !models.find((m) => m.id === model)?.vision) {
      const vm = models.find((m) => m.vision);
      if (vm) { useModel = vm.id; setModel(vm.id); toast("switched to a vision model 👁"); }
    }
    setImages([]);
    setDocs([]);
    ask(next, useModel);
  };

  const regenerate = () => {
    if (busy) return;
    let end = msgs.length;
    while (end > 0 && msgs[end - 1].role === "assistant") end--;
    if (end === 0) return;
    const history = msgs.slice(0, end);
    setMsgs(history);
    ask(history);
  };

  const stop = () => { abortRef.current?.abort(); };

  // Rewrite one finished reply in place (keeping the original so it can be toggled back).
  const humanizeReply = async (i: number) => {
    const m = msgs[i];
    if (!code || !m || m.role !== "assistant" || humBusy !== null) return;
    if (m.orig) { setMsgs((all) => all.map((x, j) => (j === i ? { ...x, content: x.orig ?? x.content, orig: undefined } : x))); return; } // toggle back
    setHumBusy(i);
    const r = await humanizeRequest({ code, model, text: m.content, strength: hum.strength, tone: hum.tone, sample: loadVoice() });
    if (r.error || !r.text) toast(r.error || "couldn’t rewrite that");
    else {
      setMsgs((all) => all.map((x, j) => (j === i ? { ...x, orig: x.content, content: r.text! } : x)));
      if (r.warnings?.length) toast(r.warnings[0]);
    }
    setHumBusy(null);
  };
  const copyText = (t: string) => navigator.clipboard?.writeText(t).then(() => toast("copied")).catch(() => {});

  // ---- threads ----
  const newThread = () => {
    const id = crypto.randomUUID();
    const t: Thread = { id, title: "new chat", updatedAt: Date.now() };
    setThreads((ts) => { const next = [t, ...ts]; try { localStorage.setItem(THREADS_KEY, JSON.stringify(next)); localStorage.setItem(threadKey(id), "[]"); } catch { /* */ } return next; });
    setActiveId(id);
    setInput(""); setImages([]); setDocs([]);
  };
  const deleteThread = (id: string) => {
    setThreads((ts) => {
      const next = ts.filter((t) => t.id !== id);
      try { localStorage.removeItem(threadKey(id)); } catch { /* */ }
      if (!next.length) { const nid = crypto.randomUUID(); next.push({ id: nid, title: "new chat", updatedAt: Date.now() }); try { localStorage.setItem(threadKey(nid), "[]"); } catch { /* */ } }
      try { localStorage.setItem(THREADS_KEY, JSON.stringify(next)); } catch { /* */ }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };
  const renameThread = (id: string) => {
    const cur = threads.find((t) => t.id === id);
    const name = window.prompt("rename chat", cur?.title || "")?.trim();
    if (name == null) return;
    setThreads((ts) => { const next = ts.map((t) => (t.id === id ? { ...t, title: name || t.title } : t)); try { localStorage.setItem(THREADS_KEY, JSON.stringify(next)); } catch { /* */ } return next; });
  };
  // ---- co-work rooms ----
  const enterRoom = (r: { id: string; title: string }) => {
    lastRoomId.current = 0; setRoomMsgs([]); setMembers([]); setRoom(r);
    setInput(""); setImages([]); setDocs([]);
  };
  const createRoom = async () => {
    if (!code) return;
    const title = window.prompt("name this project room", "project")?.trim();
    if (title == null) return;
    try {
      const r = await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "room_create", code, title: title || "project" }) });
      const d = await r.json();
      if (d?.id) { enterRoom({ id: d.id, title: d.title }); toast("room created ♡"); }
    } catch { toast("couldn’t create the room"); }
  };
  const joinRoom = async (rc?: string) => {
    if (!code) return;
    const id = (rc ?? window.prompt("enter the room code")?.trim() ?? "").toUpperCase();
    if (!id) return;
    try {
      const r = await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "room_join", code, id }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.id) enterRoom({ id: d.id, title: d.title });
      else toast(d.error || "no room with that code");
    } catch { toast("couldn’t join"); }
  };
  const leaveRoom = () => { setRoom(null); setRoomMsgs([]); setMembers([]); lastRoomId.current = 0; };
  const roomSend = async () => {
    if (!room || !code || roomBusy) return;
    const base = input.trim();
    if (!base && !images.length && !docs.length) return;
    const imgs = images;
    const text = base + (docs.length ? docs.map((d) => `\n\n--- file: ${d.name} ---\n${d.content}`).join("") : "");
    let useModel = model;
    if (imgs.length && !models.find((m) => m.id === model)?.vision) {
      const vm = models.find((m) => m.vision);
      if (vm) { useModel = vm.id; setModel(vm.id); }
    }
    setInput(""); setImages([]); setDocs([]); setRoomBusy(true);
    try {
      await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "room_send", code, id: room.id, model: useModel, web, exec, text, images: imgs }) });
    } catch { toast("send failed"); }
    setRoomBusy(false);
  };
  const copyInvite = () => { if (room) navigator.clipboard?.writeText(`${location.origin}/shh?room=${room.id}`).then(() => toast("invite link copied")).catch(() => {}); };

  // poll the shared transcript while in a room
  useEffect(() => {
    if (!room || !code) return;
    let inFlight = false;
    const poll = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const r = await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "room_poll", code, id: room.id, after: lastRoomId.current }) });
        const d = await r.json().catch(() => null);
        if (Array.isArray(d?.messages) && d.messages.length) {
          lastRoomId.current = d.messages[d.messages.length - 1].id;
          setRoomMsgs((m) => [...m, ...d.messages]);
        }
        if (Array.isArray(d?.members)) setMembers(d.members);
      } catch { /* */ } finally { inFlight = false; }
    };
    poll();
    const iv = setInterval(poll, 2500);
    return () => clearInterval(iv);
  }, [room, code]);

  // auto-join a room from a shared ?room= link, once, after unlock
  useEffect(() => {
    if (!code || autoJoined.current) return;
    autoJoined.current = true;
    try { const rc = new URLSearchParams(location.search).get("room"); if (rc) joinRoom(rc); } catch { /* */ }
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedThreads = useMemo(() => [...threads].sort((a, b) => b.updatedAt - a.updatedAt), [threads]);
  const activeTitle = threads.find((t) => t.id === activeId)?.title || "new chat";

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
      <style dangerouslySetInnerHTML={{ __html: MD_CSS }} />

      {/* decoy / boss-key cover — chat stays mounted underneath */}
      {cover && <Decoy skin={cover} onExit={() => setCover(null)} config={prefs.decoyConfig} />}

      <div className="flex flex-wrap items-center gap-2">
        {/* thread switcher */}
        <DM.Root>
          <DM.Trigger asChild>
            <button type="button" className="flex h-10 max-w-[240px] items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-3.5 text-[13px] font-bold hover:border-frost-hot">
              {room ? <Users className="size-3.5 flex-none text-frost-text" /> : <MessageSquarePlus className="size-3.5 flex-none text-frost-text" />}
              <span className="truncate">{room ? room.title : activeTitle}</span><ChevronDown className="size-3.5 flex-none opacity-60" />
            </button>
          </DM.Trigger>
          <DM.Portal>
            <DM.Content align="start" sideOffset={6} className={cn(POPUP, "z-50 flex max-h-[60vh] w-[280px] flex-col gap-0.5 overflow-y-auto rounded-2xl p-1.5")}>
              <DM.Item onSelect={() => { leaveRoom(); newThread(); }} className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-extrabold text-frost-text outline-none hover:bg-cream-blush"><MessageSquarePlus className="size-4" />New chat</DM.Item>
              <DM.Item onSelect={createRoom} className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-extrabold text-frost-text outline-none hover:bg-cream-blush"><Users className="size-4" />New co-work room</DM.Item>
              <DM.Item onSelect={() => joinRoom()} className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-bold text-plum-body outline-none hover:bg-cream-blush"><Link2 className="size-4" />Join a room…</DM.Item>
              <div className="my-1 h-px bg-line" />
              {sortedThreads.map((t) => (
                <div key={t.id} className={cn("group flex items-center gap-1 rounded-xl px-1 py-0.5", t.id === activeId && "bg-cream-blush")}>
                  <DM.Item onSelect={() => { leaveRoom(); setActiveId(t.id); }} className="flex min-w-0 flex-1 cursor-pointer items-center rounded-lg px-2 py-1.5 text-[13px] font-bold outline-none hover:bg-black/5"><span className="truncate">{t.title || "new chat"}</span></DM.Item>
                  <button type="button" onClick={(e) => { e.preventDefault(); renameThread(t.id); }} aria-label="rename" className="grid size-7 flex-none place-items-center rounded-lg text-plum-muted opacity-0 hover:bg-black/5 hover:text-frost-text group-hover:opacity-100"><Pencil className="size-3.5" /></button>
                  <button type="button" onClick={(e) => { e.preventDefault(); deleteThread(t.id); }} aria-label="delete" className="grid size-7 flex-none place-items-center rounded-lg text-plum-muted opacity-0 hover:bg-black/5 hover:text-red-500 group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
                </div>
              ))}
            </DM.Content>
          </DM.Portal>
        </DM.Root>

        <select value={model} onChange={(e) => setModel(e.target.value)} className="h-10 max-w-[220px] rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold outline-none focus:border-frost-hot">
          {models.length === 0 && <option value={model}>{model || "default"}</option>}
          {models.map((m) => <option key={m.id} value={m.id}>{m.id}{m.vision ? " 👁" : ""}</option>)}
        </select>
        <span className="flex-1" />
        {/* quick decoy: pick a skin to throw up instantly */}
        <DM.Root>
          <DM.Trigger asChild>
            <button type="button" aria-label="Decoy" title="cover the screen with a decoy" className="flex h-10 items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-3 text-[13px] font-bold text-plum-muted hover:border-frost-hot"><Drama className="size-4" /><ChevronDown className="size-3.5 opacity-60" /></button>
          </DM.Trigger>
          <DM.Portal>
            <DM.Content align="end" sideOffset={6} className={cn(POPUP, "z-50 flex w-[180px] flex-col gap-0.5 rounded-2xl p-1.5")}>
              {DECOY_SKINS.map((s) => (
                <DM.Item key={s.id} onSelect={() => setCover(s.id)} className="cursor-pointer rounded-xl px-3 py-2 text-[13px] font-bold outline-none hover:bg-cream-blush">{s.label}</DM.Item>
              ))}
            </DM.Content>
          </DM.Portal>
        </DM.Root>
        <button type="button" onClick={() => setCover(prefs.decoy || "blank")} aria-label="Hide" title="hide now — Esc or the top-left icon brings it back" className="grid h-10 w-10 place-items-center rounded-full border-1.5 border-line bg-cream-card text-plum-muted hover:border-frost-hot"><EyeOff className="size-4" /></button>
        <Customize prefs={prefs} setPrefs={setPrefs} />
        <HumanizeDialog code={code} model={model} prefs={hum} setPrefs={setHum} />
        <Setup code={code} />
      </div>

      {room && (
        <div className="flex flex-wrap items-center gap-2 rounded-shell border-1.5 border-frost-hot bg-cream-blush px-3 py-2">
          <Users className="size-4 flex-none text-frost-text" />
          <span className="text-[13px] font-extrabold">{room.title}</span>
          <button type="button" onClick={copyInvite} title="copy invite link" className="flex items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-2.5 py-1 text-[12px] font-bold hover:border-frost-hot"><span className="font-mono tracking-[.15em]">{room.id}</span><Link2 className="size-3.5" /></button>
          <span className="flex-1" />
          {members.length > 0 && <span className="truncate text-[12px] font-bold text-plum-muted">{members.length} here: {members.join(", ")}</span>}
          <button type="button" onClick={leaveRoom} className="flex items-center gap-1 rounded-full border-1.5 border-line bg-cream-card px-2.5 py-1 text-[12px] font-bold text-plum-muted hover:border-frost-hot"><LogOut className="size-3.5" />Leave</button>
        </div>
      )}

      <div className={cn("relative flex flex-1 flex-col gap-3 overflow-y-auto rounded-shell border-1.5 bg-cream-card p-3 transition sm:p-4", dragging ? "border-frost-hot ring-2 ring-frost-hot/30" : "border-line")}>
        {dragging && <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-shell bg-cream-card/80 text-[15px] font-extrabold text-frost-text">drop a file ♡</div>}

        {room && (
          <>
            {roomMsgs.length === 0 && (
              <div className="m-auto flex max-w-[400px] flex-col items-center gap-2 text-center text-plum-muted">
                <Users className="size-7 text-frost-hot" />
                <p className="text-[14px] font-bold">you’re in a co-work room. share the code up top, then anyone who joins can prompt the same assistant and you all watch the draft build together.</p>
              </div>
            )}
            {roomMsgs.map((m) => {
              const mine = m.role === "user" && m.handle === me;
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className="flex max-w-[85%] flex-col gap-1">
                    {m.role === "user" && <span className={cn("px-2 text-[11px] font-bold text-plum-muted", mine && "self-end")}>{mine ? "you" : m.handle || "someone"}</span>}
                    <div className={cn("rounded-3xl px-4 py-2.5 text-[14.5px] leading-relaxed", mine ? "whitespace-pre-wrap break-words bg-frost text-frost-ink" : m.role === "assistant" ? "break-words bg-paper text-plum-body" : "whitespace-pre-wrap break-words bg-cream text-plum-body")}>
                      {m.role === "assistant" && m.steps?.length ? <div className="mb-2 flex flex-col gap-2">{m.steps.map((s) => <ToolStep key={s.id} s={s} />)}</div> : null}
                      {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
                    </div>
                  </div>
                </div>
              );
            })}
            {roomBusy && <div className="flex justify-start"><div className="rounded-3xl bg-paper px-4 py-3"><Loader2 className="size-4 animate-spin text-frost-hot" /></div></div>}
          </>
        )}

        {!room && msgs.length === 0 && (
          <div className="m-auto flex max-w-[380px] flex-col items-center gap-2 text-center text-plum-muted">
            <Sparkles className="size-7 text-frost-hot" />
            <p className="text-[14px] font-bold">ask anything. paste/drop an image (👁), attach a file, 🌐 to search the web, or ▶ to let it run code. it streams, does math, and remembers.</p>
          </div>
        )}
        {!room && msgs.map((m, i) => (
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
                  <div className="mb-2 flex flex-col gap-2">{m.steps.map((s) => <ToolStep key={s.id} s={s} />)}</div>
                ) : null}
                {m.role === "assistant" ? (
                  m.content ? <Markdown text={m.content} /> : m.pending ? <Loader2 className="size-4 animate-spin text-frost-hot" /> : null
                ) : m.content}
                {m.role === "assistant" && m.memories?.length ? (
                  <div className="mt-2 flex flex-col gap-1">
                    {m.memories.map((f, n) => <span key={n} className="flex items-center gap-1.5 rounded-lg bg-cream-blush px-2 py-1 text-[11.5px] font-bold text-frost-text"><Brain className="size-3" />remembered: {f}</span>)}
                  </div>
                ) : null}
              </div>
              {m.role === "assistant" && m.content && !m.pending && (
                <div className="flex gap-1 px-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                  <button type="button" onClick={() => copyText(m.content)} className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11.5px] font-bold text-plum-muted hover:text-frost-text"><Copy className="size-3" />copy</button>
                  <button type="button" onClick={() => humanizeReply(i)} disabled={humBusy !== null} className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11.5px] font-bold text-plum-muted hover:text-frost-text disabled:opacity-50">{humBusy === i ? <Loader2 className="size-3 animate-spin" /> : <Feather className="size-3" />}{m.orig ? "show original" : "humanize"}</button>
                  {i === msgs.length - 1 && !busy && <button type="button" onClick={regenerate} className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11.5px] font-bold text-plum-muted hover:text-frost-text"><RotateCw className="size-3" />regenerate</button>}
                </div>
              )}
            </div>
          </div>
        ))}
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
        <p className="-mt-1 px-1 text-[12px] font-semibold text-plum-muted">this model can’t read images — i’ll switch to a 👁 model when you send.</p>
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
          <button type="button" onClick={() => setWeb((w) => !w)} aria-pressed={web} title="search the web (it decides when to search and read links)" className={cn("grid size-11 place-items-center rounded-full border-1.5 transition", web ? "border-frost-hot bg-cream-blush text-frost-text" : "border-line bg-cream-card text-plum-body hover:border-frost-hot")}><Globe className="size-5" /></button>
          <button type="button" onClick={() => setExec((x) => !x)} aria-pressed={exec} title="let it run code in a sandbox" className={cn("grid size-11 place-items-center rounded-full border-1.5 transition", exec ? "border-frost-hot bg-cream-blush text-frost-text" : "border-line bg-cream-card text-plum-body hover:border-frost-hot")}><Terminal className="size-5" /></button>
          <button type="button" onClick={toggleNatural} aria-pressed={natural} title="natural voice: replies are written like a person from the start" className={cn("grid size-11 place-items-center rounded-full border-1.5 transition", natural ? "border-frost-hot bg-cream-blush text-frost-text" : "border-line bg-cream-card text-plum-body hover:border-frost-hot")}><Feather className="size-5" /></button>
        </div>
        <textarea ref={taRef} value={input} onChange={(e) => setInput(e.target.value)}
          onPaste={(e) => { const imgs = Array.from(e.clipboardData.items).filter((it) => it.type.startsWith("image/")); if (imgs.length) { e.preventDefault(); for (const it of imgs) { const f = it.getAsFile(); if (f) readImage(f, addImage); } } }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); room ? roomSend() : send(); } }} rows={1} placeholder={room ? "message the room…" : web ? "ask — i’ll look it up…" : "message…  (paste an image, or attach a file)"}
          className="max-h-[200px] min-h-[48px] flex-1 resize-none rounded-3xl border-1.5 border-line bg-cream-card px-5 py-3 text-[15px] font-medium outline-none focus:border-frost-hot" />
        {room ? (
          <button type="button" onClick={roomSend} disabled={roomBusy || (!input.trim() && !images.length && !docs.length)} aria-label="Send" className="grid size-12 flex-none place-items-center rounded-full bg-frost text-frost-ink disabled:opacity-50">{roomBusy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}</button>
        ) : busy ? (
          <button type="button" onClick={stop} aria-label="Stop" className="grid size-12 flex-none place-items-center rounded-full border-1.5 border-line bg-cream-card text-frost-text hover:border-frost-hot"><Square className="size-4" fill="currentColor" /></button>
        ) : (
          <button type="button" onClick={send} disabled={!input.trim() && !images.length && !docs.length} className="grid size-12 flex-none place-items-center rounded-full bg-frost text-frost-ink disabled:opacity-50"><Send className="size-5" /></button>
        )}
      </div>
    </div>
  );
}
