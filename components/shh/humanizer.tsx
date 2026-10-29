"use client";
import * as D from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { Check, Copy, Feather, Loader2, X } from "lucide-react";
import { OVERLAY, POPUP } from "@/components/ui/popup";
import { STRENGTHS, TONES, type Strength, type Tone } from "@/lib/humanize";
import { toast } from "@/lib/store";
import { cn } from "@/lib/utils";

// The "Humanize" tool for /shh: paste text (or rewrite a chat reply) and get it
// back sounding like a person wrote it. Settings and the optional voice sample
// live in this browser only.

const PREFS_KEY = "shh:hum";
const VOICE_KEY = "shh:voice";

export interface HumPrefs { strength: Strength; tone: Tone }
export const DEFAULT_HUM: HumPrefs = { strength: "medium", tone: "neutral" };

export function loadHumPrefs(): HumPrefs {
  try { const v = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); return { strength: STRENGTHS.includes(v.strength) ? v.strength : DEFAULT_HUM.strength, tone: TONES.includes(v.tone) ? v.tone : DEFAULT_HUM.tone }; } catch { return DEFAULT_HUM; }
}
export const loadVoice = () => { try { return localStorage.getItem(VOICE_KEY) || ""; } catch { return ""; } };

export interface HumResult { text?: string; warnings?: string[]; error?: string }

/** Ask the server to rewrite `text`. Never throws; errors come back as `error`. */
export async function humanizeRequest(o: { code: string; model?: string; text: string; strength: Strength; tone: Tone; sample?: string }): Promise<HumResult> {
  try {
    const r = await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "humanize", ...o }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.text) return { error: d.error || "couldn’t rewrite that" };
    return { text: d.text, warnings: d.warnings || [] };
  } catch {
    return { error: "couldn’t reach the ai" };
  }
}

const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-extrabold text-plum-muted">{label}</span>
      <div className="flex gap-1">
        {options.map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={value === o}
            className={cn("flex-1 rounded-full border-1.5 px-3 py-1.5 text-[12.5px] font-bold capitalize", value === o ? "border-frost-hot bg-cream-blush text-frost-text" : "border-line hover:border-frost-hot")}>{o}</button>
        ))}
      </div>
    </div>
  );
}

export function HumanizeDialog({ code, model, prefs, setPrefs }: { code: string; model?: string; prefs: HumPrefs; setPrefs: (p: HumPrefs) => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [voice, setVoice] = useState("");
  const [showVoice, setShowVoice] = useState(false);

  useEffect(() => { setVoice(loadVoice()); }, []);
  const saveVoice = (v: string) => { setVoice(v); try { localStorage.setItem(VOICE_KEY, v); } catch { /* storage off */ } };

  const run = async () => {
    if (!input.trim() || busy) return;
    setBusy(true); setOutput(""); setWarnings([]);
    const r = await humanizeRequest({ code, model, text: input, strength: prefs.strength, tone: prefs.tone, sample: voice });
    if (r.error) toast(r.error); else { setOutput(r.text || ""); setWarnings(r.warnings || []); }
    setBusy(false);
  };
  const copy = () => navigator.clipboard?.writeText(output).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {});

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger asChild>
        <button type="button" aria-label="Humanize" title="make text sound like a person wrote it" className="flex h-10 items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-3.5 text-[13px] font-bold text-plum-muted hover:border-frost-hot"><Feather className="size-3.5" />Humanize</button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className={OVERLAY} />
        <D.Content className={cn(POPUP, "fixed left-1/2 top-1/2 flex max-h-[90vh] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-shell p-5")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <D.Title className="text-[17px] font-extrabold">Humanize text</D.Title>
              <D.Description className="text-[12px] font-semibold text-plum-muted">rewrites stiff, robotic wording so it reads like a person wrote it. numbers, links, quotes and code are kept exactly. it can’t promise to pass any ai checker.</D.Description>
            </div>
            <D.Close className="grid size-8 flex-none place-items-center rounded-full text-plum-muted hover:bg-black/5" aria-label="close"><X className="size-4" /></D.Close>
          </div>

          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={7} placeholder="paste the text to rewrite…"
            className="resize-y rounded-2xl border-1.5 border-line bg-cream-card px-4 py-3 text-[14px] outline-none focus:border-frost-hot" />
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[200px] flex-1"><Seg label="how much to change" value={prefs.strength} options={STRENGTHS} onChange={(strength) => setPrefs({ ...prefs, strength })} /></div>
            <div className="min-w-[200px] flex-1"><Seg label="voice" value={prefs.tone} options={TONES} onChange={(tone) => setPrefs({ ...prefs, tone })} /></div>
          </div>

          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={() => setShowVoice((v) => !v)} className="self-start text-[12.5px] font-bold text-frost-text underline underline-offset-2">{showVoice ? "hide" : "match my own writing"}{voice.trim() && !showVoice ? " (sample saved)" : ""}</button>
            {showVoice && (
              <>
                <textarea value={voice} onChange={(e) => saveVoice(e.target.value)} rows={4} maxLength={3000} placeholder="paste a paragraph you wrote yourself. the rewrite will copy your sentence length, word choice and quirks. saved on this device only."
                  className="resize-y rounded-2xl border-1.5 border-line bg-cream-card px-4 py-3 text-[13px] outline-none focus:border-frost-hot" />
              </>
            )}
          </div>

          <button type="button" onClick={run} disabled={busy || !input.trim()} className="flex h-11 items-center justify-center gap-2 rounded-full bg-frost font-extrabold text-frost-ink disabled:opacity-50">
            {busy ? <><Loader2 className="size-4 animate-spin" />rewriting… (long text takes a bit)</> : <><Feather className="size-4" />Humanize</>}
          </button>

          {output && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-extrabold text-plum-muted">{words(input)} → {words(output)} words</span>
                <button type="button" onClick={copy} className="flex items-center gap-1.5 rounded-full border-1.5 border-line px-3 py-1.5 text-[12.5px] font-bold hover:border-frost-hot">{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "copied" : "copy"}</button>
              </div>
              <div className="whitespace-pre-wrap rounded-2xl border-1.5 border-line bg-paper px-4 py-3 text-[14px] leading-relaxed text-plum-body">{output}</div>
              {warnings.map((w, i) => <p key={i} className="rounded-xl bg-cream-blush px-3 py-2 text-[12px] font-bold text-frost-text">{w}</p>)}
            </div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
