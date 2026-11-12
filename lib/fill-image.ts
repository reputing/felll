// Completing a picture: a graph with points to plot, a worksheet with answers to circle or write in. A vision model is bad at saying
// exactly where a pixel is, so it is not asked to. It is shown the picture with a faint labelled guide grid over it, reads
// positions off that, and says where two known values lie on each axis; the code then finds the picture's own grid lines and puts
// every mark exactly on them. Everything runs in the browser.

export type MarkType = "dot" | "cross" | "circle" | "check" | "text" | "line" | "arrow";
/** A mark, with positions as fractions of the picture (0..1 from the top-left). */
export interface Mark {
  t: MarkType; x: number; y: number; x2?: number; y2?: number; label?: string;
  /** a circle around something: its width and height; written text: its size (all fractions of the picture) */
  w?: number; h?: number; size?: number;
}
export interface Grid { xs: number[]; ys: number[] } // detected line positions, as fractions

const MAX_SIDE = 1600;
import { wordsMatching, type Box, type OcrLine } from "@/lib/fill-ocr";
/** The printed lines and empty boxes found in a worksheet (pixels of the canvas of width `w` and height `h`). */
export interface Anchors { lines: OcrLine[]; boxes: Box[]; w: number; h: number }

export async function loadImage(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file).catch(() => { throw new Error("couldn’t read that image"); });
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

// ---- what the model is shown -----------------------------------------------------------------------------------------
/** The picture with a faint grid and its fractions written along the top and left edges (0.1 ... 0.9), as a JPEG data URL. */
export function guideImage(src: HTMLCanvasElement): string {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  const w = c.width, h = c.height, fs = Math.max(11, Math.round(Math.min(w, h) / 55));
  g.lineWidth = 1; g.font = `bold ${fs}px sans-serif`; g.textBaseline = "top";
  const label = (txt: string, x: number, y: number) => { g.lineWidth = 3; g.strokeStyle = "#fff"; g.strokeText(txt, x, y); g.fillStyle = "#0a6fb0"; g.fillText(txt, x, y); };
  for (let i = 1; i < 20; i++) {
    const f = i / 20, major = i % 2 === 0;
    g.strokeStyle = major ? "rgba(0,140,220,.6)" : "rgba(0,140,220,.28)";
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(Math.round(f * w) + .5, 0); g.lineTo(Math.round(f * w) + .5, h); g.stroke();
    g.beginPath(); g.moveTo(0, Math.round(f * h) + .5); g.lineTo(w, Math.round(f * h) + .5); g.stroke();
    if (major) {
      const t = (i / 20).toFixed(1);
      label(t, Math.round(f * w) + 2, 2);
      label(t, Math.round(f * w) + 2, h - fs - 3);
      label(t, 2, Math.round(f * h) + 2);
      label(t, w - fs * 2.2, Math.round(f * h) + 2);
    }
  }
  return c.toDataURL("image/jpeg", 0.88);
}

// ---- finding the picture's own grid ----------------------------------------------------------------------------------
function peaks(prof: Float32Array, span: number): number[] {
  const n = prof.length, win = Math.max(6, Math.round(n / 60));
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + prof[i];
  const score = new Float32Array(n);
  let sum = 0, sq = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - win), b = Math.min(n, i + win + 1);
    score[i] = prof[i] - (pre[b] - pre[a]) / (b - a);
    sum += score[i]; sq += score[i] * score[i];
  }
  const mean = sum / n, sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
  const thr = mean + Math.max(1.2, 1.6 * sd);
  const cand: number[] = [];
  for (let i = 1; i < n - 1; i++) if (score[i] > thr && score[i] >= score[i - 1] && score[i] >= score[i + 1]) cand.push(i);
  // lines two or three pixels wide give a run of neighbours: keep the strongest of each
  const kept: number[] = [];
  for (const i of cand) {
    const last = kept[kept.length - 1];
    if (last !== undefined && i - last < 4) { if (score[i] > score[last]) kept[kept.length - 1] = i; } else kept.push(i);
  }
  if (kept.length < 5) return [];
  // Graph paper is regular. Chain together the neighbours that are one (or, where a line was missed, two or three) spacings apart,
  // take the longest chain, and fit a straight line through it: that gives the real spacing, which is rarely a whole number of
  // pixels (a comb with a whole-number spacing drifts off the lines at the far edge).
  const diffs = kept.slice(1).map((v, i) => v - kept[i]).sort((a, b) => a - b);
  let sp0 = diffs[Math.floor(diffs.length / 2)];
  const small = diffs.filter((d) => d >= 4 && d < sp0 * 1.5);
  if (small.length >= 3) sp0 = small[Math.floor(small.length / 2)];
  if (sp0 < 4) return [];
  let chains: { p: number; k: number }[][] = [], cur = [{ p: kept[0], k: 0 }];
  for (let i = 1; i < kept.length; i++) {
    const g = kept[i] - kept[i - 1], st = Math.round(g / sp0);
    if (st >= 1 && st <= 3 && Math.abs(g / st - sp0) < 0.2 * sp0) cur.push({ p: kept[i], k: cur[cur.length - 1].k + st });
    else { chains.push(cur); cur = [{ p: kept[i], k: 0 }]; }
  }
  chains.push(cur);
  const run = chains.sort((a, b) => b[b.length - 1].k - a[a.length - 1].k)[0];
  const K = run[run.length - 1].k;
  if (run.length < 5 || K < 4) return [];
  // least squares: position = a + b * index
  const m = run.length;
  const mk = run.reduce((t, r) => t + r.k, 0) / m, mp = run.reduce((t, r) => t + r.p, 0) / m;
  let num = 0, den = 0;
  for (const r of run) { num += (r.k - mk) * (r.p - mp); den += (r.k - mk) * (r.k - mk); }
  const b1 = num / den, a0 = mp - b1 * mk;
  const out: number[] = [];
  for (let k = 0; k <= K; k++) out.push(a0 + b1 * k);
  return out.map((p) => (p + 0.5) / span);
}

/** Tick marks along an axis, for a graph with no gridlines: the strongest long line is an axis, and the little marks beside it are the ticks. */
function ticks(dark: Float32Array, w: number, h: number, horizontal: boolean): number[] {
  const along = horizontal ? w : h, across = horizontal ? h : w;
  const at = (a: number, c: number) => (horizontal ? dark[c * w + a] : dark[a * w + c]);
  // the axis: the line across the picture with the most dark in it
  const prof = new Float32Array(across);
  for (let c = 0; c < across; c++) { let t = 0; for (let a = 0; a < along; a++) t += at(a, c); prof[c] = t / along; }
  let axisAt = 0;
  for (let c = 1; c < across; c++) if (prof[c] > prof[axisAt]) axisAt = c;
  if (prof[axisAt] < 20) return [];
  let best: number[] = [];
  for (const side of [-1, 1]) {
    const band = new Float32Array(along);
    for (let a = 0; a < along; a++) { let t = 0; for (let k = 4; k <= 9; k++) { const c = axisAt + side * k; if (c >= 0 && c < across) t += at(a, c); } band[a] = t / 6; }
    const found = peaks(band, along);
    if (found.length > best.length) best = found;
  }
  return best;
}

export function detectGrid(src: HTMLCanvasElement): Grid {
  const w = src.width, h = src.height;
  const d = src.getContext("2d")!.getImageData(0, 0, w, h).data;
  const dark = new Float32Array(w * h);
  const col = new Float32Array(w), row = new Float32Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const v = 255 - (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
    dark[y * w + x] = v; col[x] += v; row[y] += v;
  }
  for (let x = 0; x < w; x++) col[x] /= h;
  for (let y = 0; y < h; y++) row[y] /= w;
  let xs = peaks(col, w), ys = peaks(row, h);
  if (xs.length < 5) xs = ticks(dark, w, h, true);
  if (ys.length < 5) ys = ticks(dark, w, h, false);
  return { xs, ys };
}

// ---- reading the model's marks ---------------------------------------------------------------------------------------
const NUM = String.raw`-?\d*\.?\d+(?:\/\d+)?`;
const num = (s: string): number => { const m = /^(-?[\d.]+)\/(\d+)$/.exec(s.trim()); return m ? Number(m[1]) / Number(m[2]) : Number(s); };

/** 1, 2, 2.5 or 5 times a power of ten: the steps a graph's gridlines come in. */
function nice(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  let best = p, err = Infinity;
  for (const m of [1, 2, 2.5, 5, 10]) { const e = Math.abs(Math.log(x / (m * p))); if (e < err) { err = e; best = m * p; } }
  return best;
}

type Cal = [number, number][]; // [value, fraction] pairs

/**
 * Value -> fraction along one axis. From the model's two readings, and, when the picture has gridlines, tied to them: each reading is
 * matched to one of the few nearest real lines, keeping the pairing whose step (value per gridline) is a round number (1, 2, 5, 0.5...)
 * and whose lines sit closest to what the model said. A model that is a square out still lands on the right lines this way.
 */
function axis(cal: Cal | null, lines: number[]): { f: (v: number) => number; approx: boolean } | null {
  if (!cal || cal.length < 2) return null;
  const [[va, fa], [vb, fb]] = cal;
  if (va === vb || fa === fb) return null;
  const s = (fb - fa) / (vb - va);
  const raw = (v: number) => fa + (v - va) * s;
  if (lines.length < 5) return { f: raw, approx: false };
  const sp = (lines[lines.length - 1] - lines[0]) / (lines.length - 1);
  const nearest = (f: number) => lines.map((l, i) => ({ i, d: Math.abs(l - f) })).sort((a, b) => a.d - b.d).slice(0, 3);
  let best: { ia: number; ib: number; cost: number } | null = null;
  for (const A of nearest(fa)) for (const B of nearest(fb)) {
    if (A.i === B.i) continue;
    const step = (vb - va) / (B.i - A.i), ns = nice(Math.abs(step));
    const mismatch = Math.abs(Math.abs(step) - ns) / ns;
    if (mismatch > 0.02) continue;
    if (((lines[B.i] - lines[A.i]) / (vb - va)) * s < 0) continue; // runs the opposite way to what the model read
    const cost = (A.d + B.d) / sp + mismatch * 50;
    if (!best || cost < best.cost) best = { ia: A.i, ib: B.i, cost };
  }
  // the picture has a grid but the readings do not fit it: the marks go where the model said, and the result is flagged as approximate
  if (!best) return { f: raw, approx: true };
  const s2 = (lines[best.ib] - lines[best.ia]) / (vb - va), anchor = lines[best.ia];
  return { f: (v) => anchor + (v - va) * s2, approx: false };
}

/** A mark tied to printed line `idx`: where the words are, the blank or box to write in, the margin for a tick. */
function anchored(kind: string, idx: number, rest: string, a: Anchors): Mark | null {
  const L = a.lines[idx];
  if (!L) return null;
  const lh = Math.max(12, L.y1 - L.y0), cy = (L.y0 + L.y1) / 2;
  const fx = (x: number) => x / a.w, fy = (y: number) => y / a.h;
  if (kind === "circle") {
    const b = wordsMatching(L, rest || undefined), pad = lh * 0.35;
    return { t: "circle", x: fx((b.x0 + b.x1) / 2), y: fy((b.y0 + b.y1) / 2), w: fx(b.x1 - b.x0 + 2 * pad), h: fy(b.y1 - b.y0 + 2 * pad) };
  }
  if (kind === "check" || kind === "tick" || kind === "cross" || kind === "x") return { t: kind === "cross" || kind === "x" ? "cross" : "check", x: fx(Math.max(8, L.x0 - lh * 0.9)), y: fy(cy) };
  if (kind === "underline") { const b = wordsMatching(L, rest || undefined); return { t: "line", x: fx(b.x0), y: fy(b.y1 + 3), x2: fx(b.x1), y2: fy(b.y1 + 3) }; }
  if (kind === "write" || kind === "text") {
    const size = Math.min(lh, 42) * 0.85;
    // a blank made of underscores, else an empty box beside the line, else just after the line
    const blank = L.words.find((w) => /^[_.\-–—~]{3,}$|_{3,}/.test(w.text));
    if (blank) return { t: "text", x: fx(blank.x0 + 3), y: fy((blank.y0 + blank.y1) / 2 - size * 0.1), label: rest, size: fy(size) };
    // (the reader often counts the box's own border as text, so the line may run past the box: a box anywhere after the line's start will do)
    const beside = a.boxes
      .filter((b) => b.x0 > L.x0 + lh * 2 && Math.min(b.y1, L.y1 + lh) - Math.max(b.y0, L.y0 - lh) > 0.4 * (b.y1 - b.y0))
      .sort((p, q) => p.x0 - q.x0)[0];
    if (beside) { const bs = Math.min(size, (beside.y1 - beside.y0) * 0.6); return { t: "text", x: fx(beside.x0 + 8), y: fy((beside.y0 + beside.y1) / 2), label: rest, size: fy(bs) }; }
    return { t: "text", x: fx(L.x1 + lh * 0.6), y: fy(cy), label: rest, size: fy(size) };
  }
  return null;
}

export interface Parsed { marks: Mark[]; notes: string[]; approx: boolean }

/** The model's lines -> marks. Positions given as graph coordinates are converted with its axis readings and the detected grid. */
export function parseMarks(text: string, grid: Grid | null, anchors?: Anchors | null): Parsed {
  const notes: string[] = [];
  let calx: Cal | null = null, caly: Cal | null = null;
  const pairs = (rest: string): Cal => { const out: Cal = []; for (const m of rest.matchAll(new RegExp(`(${NUM})\\s*[=@:]\\s*(${NUM})`, "g"))) out.push([num(m[1]), num(m[2])]); return out; };
  const anchoredMarks: Mark[] = [];
  const raws: { t: MarkType; pos: { data: boolean; a: number; b: number }[]; label: string }[] = [];
  const kinds: Record<string, MarkType> = { underline: "line", dot: "dot", point: "dot", plot: "dot", cross: "cross", x: "cross", circle: "circle", check: "check", tick: "check", text: "text", write: "text", line: "line", segment: "line", arrow: "arrow" };

  for (const raw of text.replace(/```[a-z]*/gi, "").split("\n")) {
    const line = raw.trim().replace(/^[-*\d.)\s]+(?=(?:CAL|dot|point|plot|cross|x|circle|check|tick|text|write|underline|line|segment|arrow)\b)/i, "");
    if (!line) continue;
    const cx = /^CALX\b[:\s]*(.*)$/i.exec(line), cy = /^CALY\b[:\s]*(.*)$/i.exec(line);
    if (cx) { calx = pairs(cx[1]).slice(0, 2); continue; }
    if (cy) { caly = pairs(cy[1]).slice(0, 2); continue; }
    const m = /^([a-z]+)\b\s*[:\-]?\s*(.*)$/i.exec(line);
    const t = m && kinds[m[1].toLowerCase()];
    if (!m || !t) continue;
    // "circle L3 "Dolphin"": tied to a printed line, so it lands on the words themselves
    const anch = /\bL(\d+)\b/.exec(m[2]);
    if (anch && anchors) {
      const mk = anchored(m[1].toLowerCase(), Number(anch[1]), m[2].replace(/\bL\d+\b/, "").replace(/["“”]/g, "").replace(/\s+/g, " ").trim(), anchors);
      if (mk) anchoredMarks.push(mk); else notes.push(`skipped “${line.slice(0, 50)}” (no such line)`);
      continue;
    }
    let rest = m[2];
    const pos: { data: boolean; a: number; b: number }[] = [];
    rest = rest.replace(new RegExp(`\\(\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\)|@\\s*\\(?\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\)?`, "g"), (_, a, b, c, d) => {
      if (a !== undefined) pos.push({ data: true, a: num(a), b: num(b) }); else pos.push({ data: false, a: num(c), b: num(d) });
      return " ";
    });
    if (!pos.length) { notes.push(`skipped “${line.slice(0, 50)}” (no position)`); continue; }
    raws.push({ t, pos, label: rest.replace(/["“”]/g, "").replace(/\s+/g, " ").trim() });
  }

  const ax = axis(calx, grid?.xs ?? []), ay = axis(caly, grid?.ys ?? []);
  const usable = !!(ax && ay);
  let approx = usable && (ax!.approx || ay!.approx);
  const marks: Mark[] = [];
  for (const r of raws) {
    // a line may carry graph coordinates, plain fractions, or both (some models write both): graph coordinates win when the axes were
    // readable, else the fractions on the same line are used
    const data = r.pos.filter((p) => p.data), frac = r.pos.filter((p) => !p.data);
    const two = r.t === "line" || r.t === "arrow";
    let pts: { x: number; y: number }[] | null = null;
    if (usable && data.length >= (two ? 2 : 1)) pts = data.slice(0, two ? 2 : 1).map((p) => ({ x: ax!.f(p.a), y: ay!.f(p.b) }));
    else if (frac.length >= (two ? 2 : 1)) { pts = frac.slice(0, two ? 2 : 1).map((p) => ({ x: p.a, y: p.b })); if (data.length) approx = true; }
    if (!pts) { notes.push(`skipped “${r.t} ${r.label}” (graph coordinates, but the axes could not be read)`.replace("  ", " ")); continue; }
    const [a, b] = pts;
    if (![a.x, a.y].every((n) => Number.isFinite(n)) || a.x < -0.05 || a.x > 1.05 || a.y < -0.05 || a.y > 1.05) { notes.push(`skipped a ${r.t} that fell outside the picture`); continue; }
    marks.push({ t: r.t, x: a.x, y: a.y, ...(b ? { x2: b.x, y2: b.y } : {}), ...(r.label ? { label: r.label } : {}) });
  }
  marks.push(...anchoredMarks);
  if (approx) notes.push("the axis readings didn’t match the grid, so positions are approximate: check them");
  return { marks, notes, approx };
}

// ---- drawing ---------------------------------------------------------------------------------------------------------
/** The picture with the marks drawn on it, at the picture's own size. */
export function renderMarks(src: HTMLCanvasElement, marks: Mark[]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  const w = c.width, h = c.height, u = Math.max(5, Math.round(Math.min(w, h) / 130)), fs = Math.max(13, Math.round(Math.min(w, h) / 38));
  const RED = "#e11d48";
  g.lineCap = "round"; g.lineJoin = "round"; g.textBaseline = "middle";
  const halo = (txt: string, x: number, y: number, size = fs) => {
    g.font = `bold ${size}px sans-serif`; g.lineWidth = Math.max(3, size / 4); g.strokeStyle = "#fff"; g.fillStyle = RED;
    g.strokeText(txt, x, y); g.fillText(txt, x, y);
  };
  for (const m of marks) {
    const x = m.x * w, y = m.y * h;
    if (m.t === "line" || m.t === "arrow") {
      const x2 = (m.x2 ?? m.x) * w, y2 = (m.y2 ?? m.y) * h;
      g.strokeStyle = RED; g.lineWidth = Math.max(2, u * 0.6);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      if (m.t === "arrow") { const a = Math.atan2(y2 - y, x2 - x), L = u * 3; g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45)); g.moveTo(x2, y2); g.lineTo(x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45)); g.stroke(); }
    } else if (m.t === "dot") {
      g.fillStyle = RED; g.strokeStyle = "#fff"; g.lineWidth = Math.max(2, u * 0.45);
      g.beginPath(); g.arc(x, y, u, 0, Math.PI * 2); g.fill(); g.stroke();
    } else if (m.t === "cross") {
      g.strokeStyle = RED; g.lineWidth = Math.max(2.5, u * 0.55);
      g.beginPath(); g.moveTo(x - u, y - u); g.lineTo(x + u, y + u); g.moveTo(x + u, y - u); g.lineTo(x - u, y + u); g.stroke();
    } else if (m.t === "circle") {
      g.strokeStyle = RED; g.lineWidth = Math.max(2.5, u * 0.5);
      g.beginPath();
      if (m.w && m.h) g.ellipse(x, y, Math.max(u * 1.5, (m.w * w) / 2), Math.max(u * 1.5, (m.h * h) / 2), 0, 0, Math.PI * 2); else g.arc(x, y, u * 3.2, 0, Math.PI * 2);
      g.stroke();
    } else if (m.t === "check") {
      g.strokeStyle = RED; g.lineWidth = Math.max(3, u * 0.7);
      g.beginPath(); g.moveTo(x - u * 1.2, y); g.lineTo(x - u * 0.3, y + u); g.lineTo(x + u * 1.5, y - u * 1.3); g.stroke();
    }
    if (m.label) {
      if (m.t === "text") halo(m.label, x, y, m.size ? Math.max(11, Math.round(m.size * h)) : fs);
      else if (m.t === "dot" || m.t === "cross" || m.t === "circle") halo(m.label, x + u * 1.6, y - u * 1.6, Math.round(fs * 0.9));
    }
  }
  return c;
}

/** The nearest mark point to a position (for dragging), within `reach` pixels. */
export function hit(marks: Mark[], fx: number, fy: number, w: number, h: number, reach = 18): { i: number; end: 1 | 2 } | null {
  let best: { i: number; end: 1 | 2 } | null = null, bd = reach;
  marks.forEach((m, i) => {
    const d1 = Math.hypot((m.x - fx) * w, (m.y - fy) * h);
    if (d1 < bd) { bd = d1; best = { i, end: 1 }; }
    if (m.x2 !== undefined && m.y2 !== undefined) { const d2 = Math.hypot((m.x2 - fx) * w, (m.y2 - fy) * h); if (d2 < bd) { bd = d2; best = { i, end: 2 }; } }
  });
  return best;
}

export function canvasToPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((res, rej) => c.toBlob(async (b) => (b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error("couldn’t build the image"))), "image/png"));
}
