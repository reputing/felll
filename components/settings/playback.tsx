"use client";
import { useEffect, useState } from "react";
import { Captions, FastForward, Languages, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";

// Player preferences, stored in the browser (the player reads the same keys).
// These are per-device conveniences, so localStorage is the right home.
interface Pref { key: string; label: string; hint: string; icon: React.ComponentType<{ className?: string }>; fallback: boolean }
const PREFS: Pref[] = [
  { key: "autoNext", label: "Auto-play next episode", hint: "Roll into the next episode when one ends.", icon: SkipForward, fallback: true },
  { key: "autoSkip", label: "Auto-skip intros", hint: "Jump the opening when skip markers are known.", icon: FastForward, fallback: false },
  { key: "preferDub", label: "Prefer dub", hint: "Start on a dub server when one’s available.", icon: Languages, fallback: false },
  { key: "theater", label: "Theater mode by default", hint: "Open the player wide, sidebar tucked under.", icon: Captions, fallback: false },
];

function read(key: string, fallback: boolean): boolean {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v === "1"; } catch { return fallback; }
}

export function PlaybackSettings() {
  const [vals, setVals] = useState<Record<string, boolean>>(() => Object.fromEntries(PREFS.map((p) => [p.key, p.fallback])));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setVals(Object.fromEntries(PREFS.map((p) => [p.key, read(p.key, p.fallback)])));
    setReady(true);
  }, []);

  const toggle = (key: string) => setVals((prev) => {
    const next = { ...prev, [key]: !prev[key] };
    try { localStorage.setItem(key, next[key] ? "1" : "0"); } catch {}
    return next;
  });

  return (
    <section className="rounded-box border-1.5 border-line bg-cream-card/80 p-5 backdrop-blur-xl sm:p-7">
      <div className="eyebrow">Playback</div>
      <h2 className="mb-1 mt-1 text-xl font-extrabold tracking-[-.6px]">How episodes play</h2>
      <p className="mb-4 text-[13.5px] font-semibold text-plum-muted">Saved on this device. You can also flip these from the player’s settings menu.</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {PREFS.map((p) => {
          const on = vals[p.key];
          const Icon = p.icon;
          return (
            <button key={p.key} type="button" role="switch" aria-checked={on} aria-label={p.label} disabled={!ready} onClick={() => toggle(p.key)}
              className={cn("flex items-center gap-3 rounded-2xl border-1.5 bg-paper/80 p-3 text-left transition hover:border-frost-hot", on ? "border-frost-hot" : "border-line")}>
              <span className={cn("grid size-10 flex-none place-items-center rounded-xl transition", on ? "bg-frost text-frost-ink" : "bg-cream-tint text-plum-muted")}>
                <Icon className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-extrabold leading-tight">{p.label}</span>
                <span className="block text-[12px] font-semibold text-plum-muted">{p.hint}</span>
              </span>
              <span className={cn("relative h-6 w-11 flex-none rounded-full transition", on ? "bg-frost-hot" : "bg-line")}>
                <span className={cn("absolute top-0.5 size-5 rounded-full bg-paper shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
