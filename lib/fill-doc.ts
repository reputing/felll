// Reading and filling documents in the browser, for the "fill out a document" tool in /shh. Nothing here touches the
// server: the file is read, the model is shown what is in it (through the normal chat call), and the filled copy is built
// from the model's answer and handed back as a download. The heavy libraries load only when a file is actually opened.

export type FieldKind = "text" | "checkbox" | "dropdown" | "radio" | "list";
export interface FormField { name: string; kind: FieldKind; options?: string[]; value?: string; multiline?: boolean; maxLength?: number }

export const MAX_FIELDS = 250;
export const MAX_PARAS = 700;

// ---- reading the model's answer -------------------------------------------------------------------------------------
/**
 * A reply in the form "[3] some text", one entry per line, a line without a number continuing the entry above it. This is what
 * the model is asked for instead of JSON: a small or fast model that cannot be trusted to close a brace still manages a number
 * and some words. Numbers outside the document, and chatter before the first entry, are dropped.
 */
export function parseIndexed(text: string, count: number): Map<number, string> {
  const out = new Map<number, string>();
  let cur = -1;
  for (const raw of text.replace(/```[a-z]*/gi, "").split("\n")) {
    const m = /^\s*\[(\d+)\][ \t:=.-]?[ \t]?(.*)$/.exec(raw);
    if (m) {
      const n = Number(m[1]);
      cur = n >= 0 && n < count ? n : -1;
      if (cur >= 0) out.set(cur, m[2]);
    } else if (cur >= 0 && (raw.trim() || (out.get(cur) ?? "").length)) out.set(cur, `${out.get(cur)}\n${raw}`);
  }
  // tidy each answer; a blank one (a model echoing the format with nothing after the number) is not an answer
  for (const [k, v] of out) { const t = v.replace(/\s+$/, "").replace(/^"(.*)"$/s, "$1"); if (t.trim()) out.set(k, t); else out.delete(k); }
  return out;
}

// ---- PDF -------------------------------------------------------------------------------------------------------------
/** The fillable fields of a PDF form, and its text (for context, or for a flat PDF with no fields). */
export async function readPdf(buf: ArrayBuffer): Promise<{ fields: FormField[]; text: string; pages: number }> {
  const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList } = await import("pdf-lib");
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false }).catch(() => { throw new Error("couldn’t read that PDF (it may be damaged or locked)"); });
  const fields: FormField[] = [];
  try {
    for (const f of doc.getForm().getFields()) {
      const name = f.getName();
      if (f instanceof PDFTextField) fields.push({ name, kind: "text", value: f.getText() ?? "", multiline: f.isMultiline(), maxLength: f.getMaxLength() ?? undefined });
      else if (f instanceof PDFCheckBox) fields.push({ name, kind: "checkbox", value: f.isChecked() ? "true" : "false" });
      else if (f instanceof PDFDropdown) fields.push({ name, kind: "dropdown", options: f.getOptions(), value: f.getSelected()[0] ?? "" });
      else if (f instanceof PDFRadioGroup) fields.push({ name, kind: "radio", options: f.getOptions(), value: f.getSelected() ?? "" });
      else if (f instanceof PDFOptionList) fields.push({ name, kind: "list", options: f.getOptions(), value: f.getSelected()[0] ?? "" });
      // buttons and signatures are not for a model to fill
    }
  } catch { /* a PDF with a broken form is treated as having none */ }
  let text = "";
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf.slice(0)));
    text = (await extractText(pdf, { mergePages: true })).text as string;
  } catch { /* scanned or odd PDF: the fields (if any) still work */ }
  return { fields: fields.slice(0, MAX_FIELDS), text: text.slice(0, 60_000), pages: doc.getPageCount() };
}

/** A copy of the PDF with the values written into its fields. Returns what was set and what could not be. */
export async function fillPdf(buf: ArrayBuffer, values: Record<string, string | boolean>): Promise<{ bytes: Uint8Array; set: number; skipped: string[] }> {
  const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let set = 0;
  const skipped: string[] = [];
  for (const f of form.getFields()) {
    const name = f.getName();
    if (!(name in values)) continue;
    const v = values[name];
    try {
      if (f instanceof PDFTextField) {
        // a multi-line box left on "auto" size is drawn huge by the writer (one line fills it): give it a normal text size
        if (f.isMultiline()) f.setFontSize(10);
        f.setText(typeof v === "string" ? winAnsiSafe(v) : String(v)); set++;
      }
      else if (f instanceof PDFCheckBox) { if (v === true || /^(true|yes|on|checked|x|1)$/i.test(String(v))) f.check(); else f.uncheck(); set++; }
      else if (f instanceof PDFDropdown || f instanceof PDFRadioGroup || f instanceof PDFOptionList) {
        const opts = f.getOptions();
        const want = String(v);
        const hit = opts.find((o) => o === want) ?? opts.find((o) => o.toLowerCase() === want.toLowerCase());
        if (!hit) { skipped.push(`${name} (no option "${want}")`); continue; }
        if (f instanceof PDFRadioGroup) f.select(hit); else f.select(hit);
        set++;
      }
    } catch { skipped.push(name); }
  }
  try { form.updateFieldAppearances(font); } catch { /* the viewer redraws them */ }
  return { bytes: await doc.save(), set, skipped };
}

// Helvetica (what a PDF viewer always has) covers Latin-1; anything else would make the writer throw, so it is replaced.
const MAP: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "•": "*", "→": "->", "≥": ">=", "≤": "<=", "×": "x", "−": "-", " ": " " };
export function winAnsiSafe(s: string): string {
  return Array.from(s).map((c) => MAP[c] ?? (c.charCodeAt(0) <= 255 || c === "\n" ? c : "?")).join("");
}

/** A clean PDF of plain text (headings with "# ", wrapped lines): the answers for a worksheet that has no fields to fill. */
export async function textToPdf(title: string, body: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 56, size = 11, lead = 16;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const ensure = (need: number) => { if (y - need < M) { page = doc.addPage([W, H]); y = H - M; } };
  const wrap = (text: string, f: typeof font, sz: number): string[] => {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      if (!para.trim()) { out.push(""); continue; }
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(next, sz) > W - 2 * M && line) { out.push(line); line = word; } else line = next;
      }
      out.push(line);
    }
    return out;
  };
  ensure(30);
  for (const l of wrap(winAnsiSafe(title), bold, 16)) { page.drawText(l, { x: M, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) }); y -= 22; }
  y -= 6;
  for (const raw of winAnsiSafe(body).replace(/\*\*/g, "").split("\n")) {
    const head = /^#{1,3}\s+/.test(raw);
    const text = raw.replace(/^#{1,3}\s+/, "").replace(/^[-*]\s+/, "* ");
    const f = head ? bold : font;
    for (const l of wrap(text, f, size)) {
      ensure(lead);
      if (l) page.drawText(l, { x: M, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      y -= lead;
    }
    if (head) y -= 2;
  }
  return doc.save();
}

// ---- Word (.docx) ----------------------------------------------------------------------------------------------------
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export interface Para { i: number; text: string }

async function loadDocx(buf: ArrayBuffer) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("that is not a Word document");
  const xml = await entry.async("string");
  const dom = new DOMParser().parseFromString(xml, "application/xml");
  if (dom.getElementsByTagName("parsererror").length) throw new Error("could not read that Word document");
  return { zip, dom };
}
const paraText = (p: Element): string => {
  let t = "";
  const walk = (n: Node) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType !== 1) continue;
      const e = c as Element;
      if (e.localName === "t") t += e.textContent ?? "";
      else if (e.localName === "tab") t += "\t";
      else if (e.localName === "br") t += "\n";
      else walk(e);
    }
  };
  walk(p);
  return t;
};

/** Every paragraph of the document, in order (table cells included), numbered. Empty ones are kept: an answer often goes in one. */
export async function readDocx(buf: ArrayBuffer): Promise<{ paras: Para[] }> {
  const { dom } = await loadDocx(buf);
  const ps = Array.from(dom.getElementsByTagNameNS(W_NS, "p"));
  return { paras: ps.slice(0, MAX_PARAS).map((p, i) => ({ i, text: paraText(p) })) };
}

/** A copy of the document with the given paragraphs rewritten. The first run keeps its font and size. */
export async function fillDocx(buf: ArrayBuffer, edits: Record<number, string>): Promise<{ bytes: Uint8Array; changed: number }> {
  const { zip, dom } = await loadDocx(buf);
  const ps = Array.from(dom.getElementsByTagNameNS(W_NS, "p"));
  let changed = 0;
  for (const [k, text] of Object.entries(edits)) {
    const p = ps[Number(k)];
    if (!p || typeof text !== "string") continue;
    let runs = Array.from(p.getElementsByTagNameNS(W_NS, "r")).filter((r) => r.parentNode === p || (r.parentNode as Element)?.localName === "hyperlink");
    if (!runs.length) {
      const r = dom.createElementNS(W_NS, "w:r");
      p.appendChild(r);
      runs = [r];
    }
    // empty every run, then put the new text in the first
    for (const r of runs) for (const c of Array.from(r.childNodes)) if (["t", "tab", "br"].includes((c as Element).localName)) r.removeChild(c);
    const first = runs[0];
    text.split("\n").forEach((line, n) => {
      if (n) first.appendChild(dom.createElementNS(W_NS, "w:br"));
      const t = dom.createElementNS(W_NS, "w:t");
      t.setAttribute("xml:space", "preserve");
      t.textContent = line;
      first.appendChild(t);
    });
    changed++;
  }
  zip.file("word/document.xml", new XMLSerializer().serializeToString(dom));
  return { bytes: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), changed };
}

// ---- download --------------------------------------------------------------------------------------------------------
export function download(bytes: Uint8Array, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
