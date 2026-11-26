// Where the printed words and empty boxes of a worksheet are, found in the browser (nothing is uploaded). A vision model cannot say
// where a word is to the pixel, but it can say "circle the word Dolphin on line 3": with the lines found here, that lands exactly.

export interface OcrWord { text: string; x0: number; y0: number; x1: number; y1: number }
export interface OcrLine { i: number; text: string; x0: number; y0: number; x1: number; y1: number; words: OcrWord[] }
export interface Box { x0: number; y0: number; x1: number; y1: number }

/** The text lines of the picture with their positions (pixels of the canvas). Null when the reader cannot run. */
export async function ocrLines(src: HTMLCanvasElement, timeoutMs = 60_000): Promise<OcrLine[] | null> {
  try {
    const { createWorker } = await import("tesseract.js");
    const job = (async () => {
      const worker = await createWorker("eng");
      try {
        const { data } = await worker.recognize(src);
        const lines: OcrLine[] = [];
        for (const l of (data as unknown as { lines?: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; words?: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[] }).lines ?? []) {
          const text = l.text.replace(/\s+/g, " ").trim();
          if (!text) continue;
          lines.push({ i: lines.length, text, ...l.bbox, words: (l.words ?? []).filter((w) => w.text.trim()).map((w) => ({ text: w.text.trim(), ...w.bbox })) });
        }
        return lines;
      } finally { void worker.terminate(); }
    })();
    const out = await Promise.race([job, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
    return out && out.length ? out : null;
  } catch { return null; }
}

/** Empty rectangles (answer boxes): a thin outline, hollow inside, not the size of a whole table or page. */
export function findBoxes(src: HTMLCanvasElement): Box[] {
  const w = src.width, h = src.height;
  const d = src.getContext("2d")!.getImageData(0, 0, w, h).data;
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bin[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11 < 140 ? 1 : 0;
  const seen = new Uint8Array(w * h), stack = new Int32Array(w * h);
  const out: Box[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!bin[s] || seen[s]) continue;
    let sp = 0, count = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack[sp++] = s; seen[s] = 1;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p - x) / w;
      count++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (bin[n] && !seen[n]) { seen[n] = 1; stack[sp++] = n; }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw < 24 || bh < 12 || bw > w * 0.6 || bh > h * 0.4) continue;
    if (count / (bw * bh) > 0.3) continue;            // not hollow: a letter, a picture
    if (count < 1.2 * (bw + bh)) continue;            // not a closed outline
    out.push({ x0, y0, x1, y1 });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
/** The words of a line that match a phrase (case and punctuation ignored); the whole line when there is no phrase or no match. */
export function wordsMatching(line: OcrLine, phrase?: string): { x0: number; y0: number; x1: number; y1: number; found: boolean } {
  const want = norm(phrase ?? "");
  if (want) {
    const ws = line.words;
    for (let i = 0; i < ws.length; i++) {
      let acc = "";
      for (let j = i; j < ws.length && acc.length < want.length + 2; j++) {
        acc += norm(ws[j].text);
        if (acc === want || (acc.includes(want) && j === i)) {
          const sel = ws.slice(i, j + 1);
          return { x0: Math.min(...sel.map((x) => x.x0)), y0: Math.min(...sel.map((x) => x.y0)), x1: Math.max(...sel.map((x) => x.x1)), y1: Math.max(...sel.map((x) => x.y1)), found: true };
        }
      }
    }
  }
  return { x0: line.x0, y0: line.y0, x1: line.x1, y1: line.y1, found: !want };
}
