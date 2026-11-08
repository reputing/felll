// Subtitles, handled here instead of by the browser's <track>: that is what lets a viewer shift
// them in time, restyle them, upload their own file (SRT / VTT / ASS), and download the synced
// result. Parsing and writing are pure functions; the player owns the rest.

export interface Cue { start: number; end: number; text: string }

const clean = (s: string) => s.replace(/\r/g, "").replace(/<br\s*\/?>/gi, "\n").replace(/\{\\[^}]*\}/g, "").replace(/<(?!\/?(?:i|b|u|br)\b)[^>]*>/gi, "").replace(/\\N/g, "\n").replace(/\\n/g, "\n").replace(/\\h/g, " ").trim();

// "00:01:02,500" "01:02.500" "1:02:03.45" (ASS centiseconds) → seconds
function stamp(s: string): number {
  const m = /^(?:(\d+):)?(\d+):(\d+)(?:[.,](\d+))?$/.exec(s.trim());
  if (!m) return NaN;
  const frac = m[4] ? Number("0." + m[4]) : 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac;
}

function parseCueBlocks(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->");
    const start = stamp(a), end = stamp(b.trim().split(/\s+/)[0]);
    const body = clean(lines.slice(i + 1).join("\n"));
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && body) cues.push({ start, end, text: body });
  }
  return cues;
}

function parseAss(text: string): Cue[] {
  const cues: Cue[] = [];
  let fmt: string[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (/^format:/i.test(line) && !fmt.length) { fmt = line.slice(7).split(",").map((s) => s.trim().toLowerCase()); continue; }
    if (!/^dialogue:/i.test(line)) continue;
    const f = fmt.length ? fmt : ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"];
    const parts = line.slice(9).split(",");
    const textIdx = f.indexOf("text");
    const body = parts.slice(textIdx).join(",");
    const start = stamp(parts[f.indexOf("start")] ?? ""), end = stamp(parts[f.indexOf("end")] ?? "");
    // drawing commands (\p1) are vector shapes, not words
    if (/\{[^}]*\\p[1-9]/.test(body)) continue;
    const t = clean(body);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && t) cues.push({ start, end, text: t });
  }
  return cues.sort((x, y) => x.start - y.start);
}

/** Parse VTT, SRT or ASS/SSA text. Returns [] when nothing in it looks like subtitles. */
export function parseSubs(text: string): Cue[] {
  const t = text.replace(/^\uFEFF/, "");
  if (/\[Script Info\]|^\s*Dialogue:/im.test(t)) return parseAss(t);
  return parseCueBlocks(t).sort((x, y) => x.start - y.start);
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
function fmt(sec: number, comma: boolean): string {
  const s = Math.max(0, sec);
  const ms = Math.round((s % 1) * 1000), whole = Math.floor(s);
  const carry = ms === 1000 ? 1 : 0;
  const w = whole + carry;
  return `${pad(Math.floor(w / 3600))}:${pad(Math.floor((w % 3600) / 60))}:${pad(w % 60)}${comma ? "," : "."}${pad(carry ? 0 : ms, 3)}`;
}

export function toSrt(cues: Cue[], offset = 0): string {
  return cues.map((c, i) => `${i + 1}\n${fmt(c.start + offset, true)} --> ${fmt(c.end + offset, true)}\n${c.text}\n`).join("\n");
}
export function toVtt(cues: Cue[], offset = 0): string {
  return "WEBVTT\n\n" + cues.map((c) => `${fmt(c.start + offset, false)} --> ${fmt(c.end + offset, false)}\n${c.text}\n`).join("\n");
}

/** the cues showing at time t (already includes any offset: pass t + offset) */
export function activeAt(cues: Cue[], t: number): Cue[] {
  // cues are sorted by start; a short linear scan from a binary-searched point is plenty
  let lo = 0, hi = cues.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cues[mid].start <= t) lo = mid + 1; else hi = mid; }
  const out: Cue[] = [];
  for (let i = lo - 1; i >= 0 && i > lo - 8; i--) if (cues[i].end > t) out.unshift(cues[i]);
  return out;
}

// ---- audio auto-sync ---------------------------------------------------------------------------

/** 1 where somebody is speaking according to the subtitles, 0 elsewhere, in `bin`-second bins from t0 */
export function speechSignal(cues: Cue[], t0: number, bins: number, bin: number, shift = 0): Float32Array {
  const out = new Float32Array(bins);
  for (const c of cues) {
    const a = Math.floor((c.start + shift - t0) / bin), b = Math.ceil((c.end + shift - t0) / bin);
    for (let i = Math.max(0, a); i < Math.min(bins, b); i++) out[i] = 1;
  }
  return out;
}

export interface SyncResult { offset: number; confidence: number }

/** Find how many seconds to shift the subtitles so their speech lines up with the loudness of
 *  speech heard in the audio. `energy` is the speech-band level per bin from `t0`. Returns null
 *  when there is too little to go on or no lag stands out. */
export function bestOffset(cues: Cue[], energy: ArrayLike<number>, t0: number, bin: number, maxLag = 25): SyncResult | null {
  const n = energy.length;
  if (n < 20 / bin) return null;
  // normalise the audio: subtract the median-ish baseline so silence is ~0 and speech positive
  const sorted = Array.from(energy).sort((a, b) => a - b);
  const lo = sorted[Math.floor(n * 0.2)], hi = sorted[Math.floor(n * 0.9)];
  if (hi - lo < 1e-6) return null;
  const e = Float32Array.from(energy, (v) => Math.max(0, Math.min(1, (v - lo) / (hi - lo))));
  const mean = e.reduce((s, v) => s + v, 0) / n;
  const scores: { lag: number; s: number }[] = [];
  for (let lag = -maxLag; lag <= maxLag + 1e-9; lag += bin) {
    const sig = speechSignal(cues, t0, n, bin, lag); // cues moved by +lag
    let sMean = 0; for (const v of sig) sMean += v; sMean /= n;
    if (sMean < 0.05 || sMean > 0.95) continue;
    let cov = 0, vs = 0, ve = 0;
    for (let i = 0; i < n; i++) { const a = sig[i] - sMean, b = e[i] - mean; cov += a * b; vs += a * a; ve += b * b; }
    if (vs && ve) scores.push({ lag, s: cov / Math.sqrt(vs * ve) });
  }
  if (scores.length < 10) return null;
  const best = scores.reduce((m, x) => (x.s > m.s ? x : m));
  const rest = scores.filter((x) => Math.abs(x.lag - best.lag) > 1.5);
  const avg = rest.reduce((s, x) => s + x.s, 0) / (rest.length || 1);
  const sd = Math.sqrt(rest.reduce((s, x) => s + (x.s - avg) ** 2, 0) / (rest.length || 1)) || 1;
  const z = (best.s - avg) / sd;
  return { offset: Math.round(best.lag * 10) / 10, confidence: Math.max(0, Math.min(1, (z - 2) / 4)) };
}
