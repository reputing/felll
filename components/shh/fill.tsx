"use client";
import * as D from "@radix-ui/react-dialog";
import { Download, FilePen, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { OVERLAY, POPUP } from "@/components/ui/popup";
import { download, parseIndexed, fillDocx, fillPdf, MAX_FIELDS, MAX_PARAS, readDocx, readPdf, textToPdf, type FormField, type Para } from "@/lib/fill-doc";
import { canvasToPng, detectGrid, guideImage, hit, loadImage, parseMarks, renderMarks, type Anchors, type Grid, type Mark } from "@/lib/fill-image";
import { findBoxes, ocrLines } from "@/lib/fill-ocr";
import { cn } from "@/lib/utils";

// "Fill out a document" in /shh. Pick a PDF or Word file: a fillable PDF form gets its fields filled, a Word file gets its blanks
// and answers written in, and a PDF with nothing to fill (a worksheet) gets a clean PDF of the answers. The file is read here in the
// browser; only its text and field names go to the model, through the same chat call as everything else.
const INFO_KEY = "shh:fillinfo";
const inp = "w-full rounded-xl border-1.5 border-line bg-paper px-3 py-2 text-[13px] font-semibold outline-none focus:border-frost-hot";

type Loaded =
  | { kind: "form"; name: string; buf: ArrayBuffer; fields: FormField[]; text: string }
  | { kind: "flat"; name: string; text: string; pages: number }
  | { kind: "docx"; name: string; buf: ArrayBuffer; paras: Para[] }
  | { kind: "image"; name: string; src: HTMLCanvasElement; grid: Grid; anchors: Anchors | null };
type Result =
  | { kind: "form"; values: Record<string, string> }
  | { kind: "flat"; text: string }
  | { kind: "docx"; edits: Record<number, string> }
  | { kind: "image"; marks: Mark[]; notes: string[] };

// One question to the model, streamed through the normal chat call; the answer text comes back whole. A picture rides along as an
// image part, which the route only sends to a model that can read images.
async function askModel(code: string, model: string, prompt: string, signal: AbortSignal, image?: string): Promise<string> {
  const content = image ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image } }] : prompt;
  const r = await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "chat", code, model, web: false, exec: false, messages: [{ role: "user", content }] }), signal });
  if (!r.ok || !r.body) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || "no answer");
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const ev = JSON.parse(line) as { k: string; v?: string };
        if (ev.k === "d" && ev.v) text += ev.v;
        else if (ev.k === "err") throw new Error(ev.v || "the ai couldn’t answer that");
      } catch (e) { if (e instanceof SyntaxError) continue; throw e; }
    }
  }
  return text;
}

const SAFETY = "Fill in EVERY field or blank you can, completely. For anything about me (name, address, phone, dates, ID numbers) use the details under ABOUT ME, and write them out in full. Answer any questions properly. Only leave something out when the answer really is not given anywhere, and never make up facts about me.";

function formPrompt(l: Extract<Loaded, { kind: "form" }>, info: string): string {
  const fields = l.fields.map((f, i) => `[${i}] ${f.name} (${f.kind}${f.options ? `, choose one of: ${f.options.join(" | ")}` : ""}${f.multiline ? ", long answer" : ""}${f.maxLength ? `, max ${f.maxLength} chars` : ""})${f.value ? ` currently: ${f.value}` : ""}`).join("\n");
  return `You are filling out a PDF form for me. Below are its fields, each with a number. Reply with one line per field, in exactly this form (example):\n[0] Jane Smith\n[1] 12 Oak Road\n[2] true\nFor a checkbox write true or false. For a choice field write one of its options exactly. Skip only fields that must stay empty. No other text, no explanations.\n${SAFETY}\n\nABOUT ME / INSTRUCTIONS:\n${info.trim() || "(nothing given)"}\n\nTEXT OF THE FORM (for context):\n${l.text.slice(0, 12_000) || "(none)"}\n\nFIELDS:\n${fields}`;
}
function docxPrompt(l: Extract<Loaded, { kind: "docx" }>, info: string): string {
  const paras = l.paras.map((p) => `[${p.i}] ${p.text.trim() ? p.text : "(empty)"}`).join("\n");
  return `You are filling out a Word document for me. Below are its paragraphs, each with a number. Complete it: fill in blanks (lines like ____), answer the questions or prompts (put the answer in the empty paragraph that follows a question, or in the blank), and complete anything in a table that asks for something. Reply with one line per paragraph you change, in exactly this form (example):\n[1] Name: Jane Smith\n[3] George Washington\nGive the full new text of the paragraph. Leave out paragraphs that need no change. No other text, no explanations.\n${SAFETY}\n\nABOUT ME / INSTRUCTIONS:\n${info.trim() || "(nothing given)"}\n\nPARAGRAPHS:\n${paras}`;
}
function flatPrompt(l: Extract<Loaded, { kind: "flat" }>, info: string): string {
  return `Here is the text of a document that has blanks or questions to complete (a worksheet or form). Complete it: answer every question and fill every blank, keeping the original numbering so each answer can be matched to its question. Reply with ONLY the completed content as plain text (use "# " for headings), no commentary.\n${SAFETY}\n\nABOUT ME / INSTRUCTIONS:\n${info.trim() || "(nothing given)"}\n\nDOCUMENT:\n${l.text.slice(0, 40_000)}`;
}

// A picture to complete: a graph to plot on, a worksheet to mark. The model reads positions off a guide grid drawn over the picture
// and says where two known values lie on each axis; lib/fill-image.ts turns that into exact positions.
function imagePrompt(info: string, anchors: Anchors | null): string {
  const printed = anchors ? `\n\nTHE PRINTED LINES (numbered, as read from the picture):\n${anchors.lines.map((l) => `L${l.i} ${l.text}`).join("\n")}\n\nFor anything on a printed line, tie the mark to its line number instead of guessing a position. These are exact:\ncircle L3 "Dolphin"   (circle those words on line 3; leave the words out to circle the whole line)\ncheck L3   (a tick in the margin of line 3)\ncross L3\nunderline L3 "word"\nwrite L7 "12"   (write 12 in the blank, underscores or empty box on line 7, or just after the line)` : "";
  return `The picture is a worksheet or a graph with a task to complete (plot points, draw a line, mark an answer, circle a choice, write an answer in a box). I have drawn a faint blue guide grid over it: the numbers along its edges are fractions of the picture's width (across the top and bottom) and height (down the sides, from the top), 0.1 to 0.9. Use them to read positions.

Do the task by adding marks to the picture, and reply with ONLY lines in these forms, nothing else:
CALX value=fraction value=fraction
CALY value=fraction value=fraction
dot (3,4) A
dot (-2,5) B
line (3,4) (-2,5)
dot @0.31,0.62
circle @0.45,0.30
check @0.20,0.55
cross @0.20,0.55
text @0.50,0.40 the answer to write
arrow @0.2,0.2 @0.4,0.4

How: if it is a graph with axes, give CALX and CALY first. Each gives two values that are printed on that axis and where each lies, as a fraction from the guide grid (CALX: fraction of the width from the left; CALY: fraction of the height from the top), for example "CALX -10=0.08 10=0.93". Read them as exactly as you can. Then give every mark with graph coordinates in brackets, as in "dot (3,4) A". If it is not a graph, give each mark's position as @fraction,fraction read from the guide grid. Work out the right answers yourself. Mark ONLY what the task asks for: for a multiple-choice question, circle only the correct option. Do exactly what the task asks, and nothing else.${printed}

INSTRUCTIONS FROM ME (what to do, if I said):
${info.trim() || "(none: find the task in the picture and do it)"}`;
}

export function FillDocButton({ code, model, others = [], visionModels = [] }: { code: string; model: string; others?: string[]; visionModels?: string[] }) {
  const pick = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [info, setInfo] = useState(() => { try { return localStorage.getItem(INFO_KEY) ?? ""; } catch { return ""; } });
  const [busy, setBusy] = useState<"read" | "ask" | "save" | null>(null);
  const [err, setErr] = useState("");
  const ctl = useRef<AbortController | null>(null);

  const reset = () => { ctl.current?.abort(); setLoaded(null); setRes(null); setErr(""); setBusy(null); };
  const close = () => { setOpen(false); reset(); };

  const onFile = async (f: File) => {
    reset(); setOpen(true); setBusy("read");
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error("that file is over 20MB");
      if (f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name)) {
        const src = await loadImage(f);
        let grid: Grid = { xs: [], ys: [] };
        try { grid = detectGrid(src); } catch { /* no grid found: the model's readings are used as they are */ }
        // a worksheet (no regular grid): read where its printed words and empty boxes are, so marks can be tied to them. A graph does not need it.
        let anchors: Anchors | null = null;
        if (!(grid.xs.length >= 5 && grid.ys.length >= 5)) {
          const lines = await ocrLines(src);
          if (lines) anchors = { lines: lines.slice(0, 150), boxes: findBoxes(src), w: src.width, h: src.height };
        }
        setLoaded({ kind: "image", name: f.name, src, grid, anchors });
        setBusy(null);
        return;
      }
      const buf = await f.arrayBuffer();
      const isPdf = /\.pdf$/i.test(f.name) || f.type === "application/pdf";
      const isDocx = /\.docx$/i.test(f.name);
      if (isPdf) {
        const r = await readPdf(buf);
        setLoaded(r.fields.length ? { kind: "form", name: f.name, buf, fields: r.fields, text: r.text } : { kind: "flat", name: f.name, text: r.text, pages: r.pages });
        if (!r.fields.length && !r.text.trim()) throw new Error("this PDF has no fillable fields and no readable text (a scan?), so there is nothing to work from");
      } else if (isDocx) {
        const r = await readDocx(buf);
        setLoaded({ kind: "docx", name: f.name, buf, paras: r.paras });
      } else throw new Error("PDF or Word (.docx) files only. an old .doc? save it as .docx first");
    } catch (e) { setErr((e as Error).message || "couldn’t read that file"); setLoaded(null); }
    setBusy(null);
  };

  const run = async () => {
    if (!loaded) return;
    try { localStorage.setItem(INFO_KEY, info); } catch { /* */ }
    setBusy("ask"); setErr(""); setRes(null);
    const ac = new AbortController(); ctl.current = ac;
    try {
      if (loaded.kind === "image") {
        // only a model that can read pictures is any use here; the chosen one first when it can
        const seers = [model, ...visionModels].filter((m, i, a) => visionModels.includes(m) && a.indexOf(m) === i).slice(0, 3);
        if (!seers.length) throw new Error("no working model can read pictures right now, so it can’t see this one. try again in a minute");
        const guide = guideImage(loaded.src);
        let best: { marks: Mark[]; notes: string[]; approx: boolean } | null = null, lastErr = "";
        for (let i = 0; i < seers.length && !ac.signal.aborted; i++) {
          if (i) setErr(`that model didn’t manage it, trying another (${i + 1}/${seers.length})…`);
          let text = "";
          try { text = await askModel(code, seers[i], imagePrompt(info, loaded.anchors), ac.signal, guide); } catch (e) { if ((e as Error).name === "AbortError") throw e; lastErr = (e as Error).message; continue; }
          const p = parseMarks(text, loaded.grid, loaded.anchors);
          // the answer with the most marks wins, and between equals the one that is not flagged as approximate; stop at a clean one
          if (p.marks.length && (!best || p.marks.length > best.marks.length || (p.marks.length === best.marks.length && best.approx && !p.approx))) best = p;
          if (best && !best.approx && best.notes.length === 0) break;
        }
        setErr("");
        if (!best) throw new Error(lastErr || "the ai couldn’t find where to put anything, try again or say what to do");
        setRes({ kind: "image", marks: best.marks, notes: best.notes });
        setBusy(null);
        return;
      }
      const prompt = loaded.kind === "form" ? formPrompt(loaded, info) : loaded.kind === "docx" ? docxPrompt(loaded, info) : flatPrompt(loaded, info);
      const count = loaded.kind === "form" ? loaded.fields.length : loaded.kind === "docx" ? loaded.paras.length : 0;
      // The chosen model first. If it gives nothing usable, the next working ones get a go (a fast model sometimes cannot follow a
      // format; another one can), up to three in all.
      const tryModels = [model, ...others.filter((m) => m !== model)].slice(0, 3);
      let got: Map<number, string> | null = null, flat = "", lastErr = "";
      for (let i = 0; i < tryModels.length && !ac.signal.aborted; i++) {
        if (i) setErr(`that model didn’t manage it, trying another (${i + 1}/${tryModels.length})…`);
        let text = "";
        try { text = await askModel(code, tryModels[i], prompt, ac.signal); } catch (e) { if ((e as Error).name === "AbortError") throw e; lastErr = (e as Error).message; continue; }
        if (loaded.kind === "flat") { if (text.trim().length > 20) { flat = text.trim(); break; } continue; }
        const m = parseIndexed(text, count);
        // keep the fullest answer seen; for a form, stop only when most fields are covered (a model that skips half is replaced)
        if (m.size && (!got || m.size > got.size)) got = m;
        if (got && (loaded.kind !== "form" || got.size >= Math.ceil(count * 0.6))) break;
      }
      setErr("");
      if (loaded.kind === "flat") {
        if (!flat) throw new Error(lastErr || "the ai returned nothing, try again");
        setRes({ kind: "flat", text: flat });
      } else if (!got) throw new Error(lastErr || "the ai didn’t answer in a way i could use, try again");
      else if (loaded.kind === "form") {
        const values: Record<string, string> = {};
        for (const [i, v] of got) values[loaded.fields[i].name] = v;
        setRes({ kind: "form", values });
      } else {
        const edits: Record<number, string> = {};
        for (const [i, v] of got) edits[i] = v;
        setRes({ kind: "docx", edits });
      }
    } catch (e) { if ((e as Error).name !== "AbortError") setErr((e as Error).message || "something went wrong"); }
    setBusy(null);
  };

  const save = async () => {
    if (!loaded || !res) return;
    setBusy("save"); setErr("");
    try {
      const base = loaded.name.replace(/\.[^.]+$/, "");
      if (loaded.kind === "form" && res.kind === "form") {
        const { bytes, set, skipped } = await fillPdf(loaded.buf, res.values);
        download(bytes, `${base}-filled.pdf`, "application/pdf");
        if (skipped.length) setErr(`filled ${set}; couldn’t set: ${skipped.slice(0, 6).join(", ")}${skipped.length > 6 ? "…" : ""}`);
      } else if (loaded.kind === "docx" && res.kind === "docx") {
        const { bytes } = await fillDocx(loaded.buf, res.edits);
        download(bytes, `${base}-filled.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      } else if (loaded.kind === "flat" && res.kind === "flat") {
        download(await textToPdf(`${base}: completed`, res.text), `${base}-answers.pdf`, "application/pdf");
      } else if (loaded.kind === "image" && res.kind === "image") {
        download(await canvasToPng(renderMarks(loaded.src, res.marks)), `${base}-done.png`, "image/png");
      }
    } catch (e) { setErr((e as Error).message || "couldn’t build the file"); }
    setBusy(null);
  };

  const summary = !loaded ? "" : loaded.kind === "form" ? `a fillable form: ${loaded.fields.length} field${loaded.fields.length === 1 ? "" : "s"}${loaded.fields.length >= MAX_FIELDS ? ` (first ${MAX_FIELDS})` : ""}`
    : loaded.kind === "docx" ? `a word document: ${loaded.paras.length} paragraph${loaded.paras.length === 1 ? "" : "s"}${loaded.paras.length >= MAX_PARAS ? ` (first ${MAX_PARAS})` : ""}`
    : loaded.kind === "image" ? `a picture${loaded.grid.xs.length > 4 && loaded.grid.ys.length > 4 ? ` with a grid (${loaded.grid.xs.length - 1}×${loaded.grid.ys.length - 1} squares found)` : loaded.anchors ? ` with ${loaded.anchors.lines.length} lines of text` : ""}: you will get the picture back with the task done on it`
    : `a pdf with no fields (${loaded.pages} page${loaded.pages === 1 ? "" : "s"}): you will get a pdf of the answers`;

  return (
    <>
      <input ref={pick} type="file" accept=".pdf,.docx,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
      <button type="button" onClick={() => pick.current?.click()} aria-label="Fill out a document" title="have the ai fill out a pdf, word file or a picture (graphs, worksheets)" className="grid size-11 place-items-center rounded-full border-1.5 border-line bg-cream-card text-plum-body hover:border-frost-hot"><FilePen className="size-[18px]" /></button>
      <D.Root open={open} onOpenChange={(o) => { if (!o) close(); }}>
        <D.Portal>
          <D.Overlay className={OVERLAY} />
          <D.Content className={cn(POPUP, "fixed left-1/2 top-1/2 flex max-h-[90vh] w-[min(94vw,680px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-shell p-5")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <D.Title className="text-[17px] font-extrabold">Fill out a document</D.Title>
                <D.Description className="truncate text-[12px] font-semibold text-plum-muted">{loaded ? `${loaded.name} · ${summary}` : busy === "read" ? "reading the file…" : "pdf forms, worksheets and word files. read in your browser; only its text goes to the ai."}</D.Description>
              </div>
              <D.Close aria-label="Close" className="grid size-9 flex-none place-items-center rounded-full hover:bg-cream-blush"><X className="size-4" /></D.Close>
            </div>

            {busy === "read" && <div className="flex items-center gap-2 text-[13px] font-semibold text-plum-muted"><Loader2 className="size-4 animate-spin" />reading…</div>}

            {loaded && !res && (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-extrabold uppercase tracking-[.1em] text-plum-muted">{loaded.kind === "image" ? "what to do (optional)" : "about you / instructions"}</span>
                  <textarea value={info} onChange={(e) => setInfo(e.target.value)} rows={5} placeholder={loaded.kind === "image" ? "e.g. plot the points in question 3 and join them. leave blank to let it find the task" : "anything it should use: your name, address, dates, the answers you want, how to write them…\n(saved on this device)"} className={cn(inp, "resize-y")} />
                </label>
                <button type="button" onClick={run} disabled={busy === "ask"} className="flex h-11 items-center justify-center gap-2 rounded-full border-1.5 border-frost-hot bg-frost text-[14px] font-extrabold text-frost-ink disabled:opacity-60">
                  {busy === "ask" ? <><Loader2 className="size-4 animate-spin" />filling it out…</> : "fill it out"}
                </button>
              </>
            )}

            {loaded && res && (
              <>
                <p className="text-[12px] font-semibold text-plum-muted">check it over, change anything, then download. it is only as good as the model and what you gave it.</p>
                <div className="flex max-h-[44vh] flex-col gap-2 overflow-y-auto pr-1">
                  {res.kind === "form" && loaded.kind === "form" && loaded.fields.filter((f) => f.name in res.values).map((f) => (
                    <label key={f.name} className="flex flex-col gap-1">
                      <span className="truncate text-[12px] font-extrabold text-plum-muted" title={f.name}>{f.name}</span>
                      {f.kind === "checkbox"
                        ? <input type="checkbox" checked={/^(true|yes|on|checked|x|1)$/i.test(res.values[f.name])} onChange={(e) => setRes({ kind: "form", values: { ...res.values, [f.name]: String(e.target.checked) } })} className="size-5 accent-[var(--frost)]" />
                        : f.options
                          ? <select value={res.values[f.name]} onChange={(e) => setRes({ kind: "form", values: { ...res.values, [f.name]: e.target.value } })} className={inp}>{!f.options.includes(res.values[f.name]) && <option value={res.values[f.name]}>{res.values[f.name]}</option>}{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                          : <textarea rows={f.multiline ? 3 : 1} value={res.values[f.name]} onChange={(e) => setRes({ kind: "form", values: { ...res.values, [f.name]: e.target.value } })} className={cn(inp, "resize-y")} />}
                    </label>
                  ))}
                  {res.kind === "docx" && loaded.kind === "docx" && Object.entries(res.edits).map(([k, v]) => (
                    <label key={k} className="flex flex-col gap-1">
                      <span className="truncate text-[12px] font-semibold text-plum-muted">was: {loaded.paras[Number(k)]?.text.trim() || "(empty paragraph)"}</span>
                      <textarea rows={2} value={v} onChange={(e) => setRes({ kind: "docx", edits: { ...res.edits, [Number(k)]: e.target.value } })} className={cn(inp, "resize-y")} />
                    </label>
                  ))}
                  {res.kind === "image" && loaded.kind === "image" && (
                    <>
                      <ImagePreview src={loaded.src} marks={res.marks} onChange={(marks) => setRes({ ...res, marks })} />
                      {res.notes.length > 0 && <p className="text-[12px] font-semibold text-plum-muted">{res.notes.slice(0, 4).join(" · ")}</p>}
                    </>
                  )}
                  {res.kind === "flat" && <textarea rows={14} value={res.text} onChange={(e) => setRes({ kind: "flat", text: e.target.value })} className={cn(inp, "resize-y font-mono text-[12.5px]")} />}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={save} disabled={busy === "save"} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border-1.5 border-frost-hot bg-frost px-5 text-[14px] font-extrabold text-frost-ink disabled:opacity-60">
                    {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}download
                  </button>
                  <button type="button" onClick={() => { setRes(null); setErr(""); }} className="h-11 rounded-full border-1.5 border-line bg-cream-card px-5 text-[13.5px] font-bold hover:border-frost-hot">try again</button>
                </div>
              </>
            )}

            {err && <p role="alert" className="rounded-xl border-1.5 border-line bg-cream-blush px-3 py-2 text-[12.5px] font-semibold text-frost-text">{err}</p>}
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}

// The finished picture. Marks can be dragged onto the exact spot if the model was a hair off, and double-clicked away.
function ImagePreview({ src, marks, onChange }: { src: HTMLCanvasElement; marks: Mark[]; onChange: (m: Mark[]) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ i: number; end: 1 | 2 } | null>(null);
  useEffect(() => {
    const out = renderMarks(src, marks), c = cv.current;
    if (!c) return;
    c.width = out.width; c.height = out.height;
    c.getContext("2d")!.drawImage(out, 0, 0);
  }, [src, marks]);
  const frac = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, scale: src.width / r.width };
  };
  return (
    <div className="flex flex-col gap-1.5">
      <canvas
        ref={cv} data-testid="fill-preview" aria-label="The finished picture" className="w-full touch-none rounded-xl border-1.5 border-line bg-white"
        onPointerDown={(e) => { const { fx, fy, scale } = frac(e); const h = hit(marks, fx, fy, src.width, src.height, 22 * scale); if (h) { drag.current = h; e.currentTarget.setPointerCapture(e.pointerId); } }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d) return;
          const { fx, fy } = frac(e);
          const x = Math.min(1, Math.max(0, fx)), y = Math.min(1, Math.max(0, fy));
          onChange(marks.map((m, i) => (i !== d.i ? m : d.end === 1 ? { ...m, x, y } : { ...m, x2: x, y2: y })));
        }}
        onPointerUp={() => { drag.current = null; }}
        onDoubleClick={(e) => { const { fx, fy, scale } = frac(e as unknown as React.PointerEvent); const h = hit(marks, fx, fy, src.width, src.height, 22 * scale); if (h) onChange(marks.filter((_, i) => i !== h.i)); }}
      />
      <p className="text-[11.5px] font-semibold text-plum-muted">drag a mark to move it, double-click one to remove it.</p>
    </div>
  );
}
