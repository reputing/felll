"use client";
import { useRef, useState } from "react";
import { ArrowLeft, AudioLines, Check, ChevronRight, Download, Loader2, Upload, X } from "lucide-react";
import type { Source, Track } from "./player";
import { DEFAULT_STYLE, type SubStyle } from "./subtitles";
import { cn } from "@/lib/utils";

// One settings panel for the player: servers grouped by Sub / Dub, speed, subtitles (with their
// own timing and style page), and the playback toggles. It opens above the gear and stays put;
// nothing slides over the picture.

export interface SyncState { phase: "idle" | "listening" | "done" | "error"; msg: string; progress: number }

const AUDIO_LABEL = { sub: "Sub", dub: "Dub", raw: "Raw" } as const;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SWATCH = ["#ffffff", "#ffe66d", "#7dffcf", "#8ecbff", "#ff9ec7"];
const chip = "h-8 rounded-lg px-2.5 text-[12px] font-extrabold transition";
const on = "bg-frost text-frost-ink";
const off = "bg-white/10 text-white hover:bg-white/20";

function Label({ children }: { children: React.ReactNode }) { return <div className="px-1 pb-1.5 pt-3 text-[10.5px] font-extrabold uppercase tracking-[.12em] text-white/50">{children}</div>; }
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-[13px] font-bold text-white hover:bg-white/10">
      <span className="flex-1">{label}</span>
      <span className={cn("relative h-5 w-9 rounded-full transition", checked ? "bg-frost-hot" : "bg-white/25")}><span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} /></span>
    </button>
  );
}
function Slider({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 py-1 text-[12.5px] font-bold text-white">
      <span className="w-[74px] flex-none text-white/80">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 flex-1 accent-[var(--frost)]" />
      <span className="w-11 flex-none text-right font-mono text-[11.5px] text-white/70">{value}{unit}</span>
    </label>
  );
}

export interface PanelProps {
  sources: Source[]; current?: Source; dead: Set<string | number>; failed: Set<string | number>; onPick: (s: Source) => void;
  speed: number; onSpeed: (s: number) => void;
  subs: Track[]; caption: string | number | null; onCaption: (id: string | number | null) => void;
  mineName: string | null; onUpload: (file: File) => Promise<string | null>; onRemoveMine: () => void;
  offset: number; onOffset: (v: number) => void; onAutoSync: () => void; sync: SyncState; hasCues: boolean; onDownload: (fmt: "srt" | "vtt") => void;
  style: SubStyle; onStyle: (p: Partial<SubStyle>) => void; onResetStyle: () => void;
  autoNext: boolean; onAutoNext: (v: boolean) => void; stopAfter: boolean; onStopAfter: (v: boolean) => void;
  sleepMin: number | null; onSleep: (m: number | null) => void;
  page: "main" | "subs"; onPage: (p: "main" | "subs") => void; onClose: () => void;
  /** movies: only the subtitles page, opening at the top of the picture (the native controls sit at the bottom) */
  subsOnly?: boolean;
}

export function SettingsPanel(p: PanelProps) {
  const file = useRef<HTMLInputElement>(null);
  const [upMsg, setUpMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const audios = (["sub", "dub", "raw"] as const).filter((a) => p.sources.some((s) => s.audio === a));
  const [audio, setAudio] = useState<"sub" | "dub" | "raw">(p.current?.audio ?? audios[0] ?? "sub");
  const list = p.sources.filter((s) => s.audio === audio && (s.id === p.current?.id || (!p.dead.has(s.id) && !p.failed.has(s.id))));
  const capName = p.caption == null ? "Off" : p.subs.find((s) => s.id === p.caption)?.label ?? "On";

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setUpMsg(null);
    setUpMsg(await p.onUpload(f));
    setBusy(false);
  };

  const box = cn(p.subsOnly ? "top-2" : "bottom-[58px]", "absolute right-2 z-30 max-h-[min(70%,460px)] w-[min(320px,calc(100%-1rem))] overflow-y-auto rounded-2xl border border-white/15 bg-black/90 p-3 text-white shadow-[0_18px_40px_-12px_rgba(0,0,0,.9)] backdrop-blur-xl animate-in fade-in");

  if (p.page === "subs" || p.subsOnly) {
    return (
      <div className={box} role="dialog" aria-label="Subtitle settings" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          {!p.subsOnly && <button type="button" onClick={() => p.onPage("main")} aria-label="Back" className="grid size-8 place-items-center rounded-full hover:bg-white/15"><ArrowLeft className="size-4" /></button>}
          <span className="flex-1 text-[14px] font-extrabold">Subtitles</span>
          <button type="button" onClick={p.onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full hover:bg-white/15"><X className="size-4" /></button>
        </div>

        <Label>Track</Label>
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => p.onCaption(null)} className={cn("flex items-center rounded-lg px-2 py-1.5 text-left text-[13px] font-bold hover:bg-white/10", p.caption == null && "bg-white/10")}><span className="flex-1">Off</span>{p.caption == null && <Check className="size-4" strokeWidth={3} />}</button>
          {p.subs.map((s) => (
            <button key={s.id} type="button" onClick={() => p.onCaption(s.id)} className={cn("flex items-center rounded-lg px-2 py-1.5 text-left text-[13px] font-bold hover:bg-white/10", p.caption === s.id && "bg-white/10")}><span className="flex-1 truncate">{s.label}</span>{p.caption === s.id && <Check className="size-4" strokeWidth={3} />}</button>
          ))}
        </div>

        <Label>Your own file</Label>
        <input ref={file} type="file" accept=".srt,.vtt,.ass,.ssa,text/plain,text/vtt" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => file.current?.click()} className={cn(chip, off, "flex flex-1 items-center justify-center gap-1.5 disabled:opacity-60")}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}{p.mineName ? "Replace file" : "Upload .srt .vtt .ass"}
          </button>
          {p.mineName && <button type="button" onClick={p.onRemoveMine} className={cn(chip, off)} aria-label="Remove my subtitles">Remove</button>}
        </div>
        {p.mineName && <p className="mt-1.5 truncate px-1 text-[11.5px] text-white/60">on this episode: {p.mineName}</p>}
        {upMsg && <p className="mt-1.5 px-1 text-[11.5px] font-bold text-red-300">{upMsg}</p>}

        <Label>Timing</Label>
        <div className="flex items-center gap-1">
          {[-1, -0.1].map((d) => <button key={d} type="button" onClick={() => p.onOffset(Math.round((p.offset + d) * 10) / 10)} className={cn(chip, off, "w-11")}>{d}</button>)}
          <span className="flex-1 text-center font-mono text-[13px] font-bold">{p.offset > 0 ? "+" : ""}{p.offset.toFixed(1)}s</span>
          {[0.1, 1].map((d) => <button key={d} type="button" onClick={() => p.onOffset(Math.round((p.offset + d) * 10) / 10)} className={cn(chip, off, "w-11")}>+{d}</button>)}
          <button type="button" onClick={() => p.onOffset(0)} className={cn(chip, off)}>0</button>
        </div>
        <p className="px-1 pt-1 text-[11px] text-white/50">+ shows them later, − earlier.</p>
        <button type="button" disabled={!p.hasCues || p.sync.phase === "listening"} onClick={p.onAutoSync} className={cn(chip, off, "mt-2 flex h-9 w-full items-center justify-center gap-2 disabled:opacity-50")}>
          {p.sync.phase === "listening" ? <Loader2 className="size-4 animate-spin" /> : <AudioLines className="size-4" />}
          {p.sync.phase === "listening" ? `Listening… ${Math.round(p.sync.progress * 100)}%` : "Auto-sync by listening to the audio"}
        </button>
        {p.sync.msg && <p className={cn("px-1 pt-1.5 text-[11.5px] font-bold", p.sync.phase === "error" ? "text-red-300" : "text-frost")}>{p.sync.msg}</p>}
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={!p.hasCues} onClick={() => p.onDownload("srt")} className={cn(chip, off, "flex flex-1 items-center justify-center gap-1.5 disabled:opacity-50")}><Download className="size-3.5" />.srt</button>
          <button type="button" disabled={!p.hasCues} onClick={() => p.onDownload("vtt")} className={cn(chip, off, "flex flex-1 items-center justify-center gap-1.5 disabled:opacity-50")}><Download className="size-3.5" />.vtt</button>
        </div>
        <p className="px-1 pt-1 text-[11px] text-white/50">Downloads the subtitles with this timing applied.</p>

        <Label>Look</Label>
        <Slider label="Size" value={p.style.size} min={60} max={220} step={5} unit="%" onChange={(size) => p.onStyle({ size })} />
        <Slider label="Height" value={p.style.bottom} min={1} max={60} unit="%" onChange={(bottom) => p.onStyle({ bottom })} />
        <Slider label="Backdrop" value={p.style.bg} min={0} max={90} step={5} unit="%" onChange={(bg) => p.onStyle({ bg })} />
        <div className="flex items-center gap-2 py-1.5">
          <span className="w-[74px] flex-none text-[12.5px] font-bold text-white/80">Colour</span>
          <div className="flex gap-1.5">{SWATCH.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => p.onStyle({ color: c })} className={cn("size-6 rounded-full border-2", p.style.color === c ? "border-frost" : "border-white/20")} style={{ background: c }} />)}</div>
        </div>
        <div className="flex items-center gap-2 py-1">
          <span className="w-[74px] flex-none text-[12.5px] font-bold text-white/80">Edge</span>
          <div className="flex gap-1">{(["none", "outline", "shadow"] as const).map((e) => <button key={e} type="button" onClick={() => p.onStyle({ edge: e })} className={cn(chip, p.style.edge === e ? on : off, "capitalize")}>{e}</button>)}</div>
        </div>
        <div className="flex items-center gap-2 py-1">
          <span className="w-[74px] flex-none text-[12.5px] font-bold text-white/80">Font</span>
          <div className="flex gap-1">
            {(["sans", "serif", "mono"] as const).map((f) => <button key={f} type="button" onClick={() => p.onStyle({ font: f })} className={cn(chip, p.style.font === f ? on : off, "capitalize")}>{f}</button>)}
            <button type="button" onClick={() => p.onStyle({ bold: !p.style.bold })} aria-pressed={p.style.bold} className={cn(chip, p.style.bold ? on : off, "font-black")}>B</button>
          </div>
        </div>
        <button type="button" onClick={p.onResetStyle} disabled={JSON.stringify(p.style) === JSON.stringify(DEFAULT_STYLE)} className="mt-1 text-[11.5px] font-bold text-white/60 underline-offset-2 hover:underline disabled:opacity-40">Reset look</button>
      </div>
    );
  }

  return (
    <div className={box} role="dialog" aria-label="Player settings" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center">
        <span className="flex-1 text-[14px] font-extrabold">Settings</span>
        <button type="button" onClick={p.onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full hover:bg-white/15"><X className="size-4" /></button>
      </div>

      <Label>Server</Label>
      {audios.length > 1 && (
        <div className="mb-1.5 flex gap-1" role="tablist" aria-label="Audio">
          {audios.map((a) => <button key={a} type="button" role="tab" aria-selected={audio === a} onClick={() => setAudio(a)} className={cn(chip, "flex-1", audio === a ? on : off)}>{AUDIO_LABEL[a]}<span className="ml-1 opacity-60">{p.sources.filter((s) => s.audio === a && !p.dead.has(s.id)).length}</span></button>)}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {list.length === 0 && <span className="px-1 text-[12px] text-white/50">no working server for this</span>}
        {list.map((s) => (
          <button key={s.id} type="button" onClick={() => p.onPick(s)} aria-pressed={p.current?.id === s.id} className={cn(chip, "flex items-center gap-1.5", p.current?.id === s.id ? on : off)}>
            {s.label}{p.current?.id === s.id && <Check className="size-3.5" strokeWidth={3} />}
          </button>
        ))}
      </div>

      <Label>Speed</Label>
      <div className="grid grid-cols-6 gap-1">
        {SPEEDS.map((s) => <button key={s} type="button" onClick={() => p.onSpeed(s)} className={cn(chip, "px-0", p.speed === s ? on : off)}>{s}×</button>)}
      </div>

      <Label>Subtitles</Label>
      <button type="button" onClick={() => p.onPage("subs")} className="flex w-full items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-left text-[13px] font-bold hover:bg-white/20">
        <span className="flex-1 truncate">{capName}</span>
        <span className="text-[11.5px] text-white/60">timing · style · upload</span><ChevronRight className="size-4" />
      </button>

      <Label>Playback</Label>
      <Toggle checked={p.autoNext} onChange={p.onAutoNext} label="Auto-play next episode" />
      <Toggle checked={p.stopAfter} onChange={p.onStopAfter} label="Stop after this episode" />
      <div className="flex items-center gap-1 pt-1.5">
        <span className="flex-1 px-1 text-[13px] font-bold">Sleep timer</span>
        {[15, 30, 60].map((m) => <button key={m} type="button" onClick={() => p.onSleep(p.sleepMin === m ? null : m)} className={cn(chip, p.sleepMin === m ? on : off)}>{m}m</button>)}
        <button type="button" onClick={() => p.onSleep(null)} className={cn(chip, p.sleepMin == null ? on : off)}>Off</button>
      </div>
    </div>
  );
}
