"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// One shared ticking clock for every countdown on the page.
const listeners = new Set<(t: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function useNow(): number | null {
  const [t, setT] = useState<number | null>(null);
  useEffect(() => {
    listeners.add(setT);
    setT(Date.now());
    timer ??= setInterval(() => { const n = Date.now(); listeners.forEach((f) => f(n)); }, 1000);
    return () => {
      listeners.delete(setT);
      if (!listeners.size && timer) { clearInterval(timer); timer = null; }
    };
  }, []);
  return t;
}

const two = (n: number) => String(n).padStart(2, "0");

/** "2d 04:13:09" until `at` (unix seconds), live. */
export function Countdown({ at, className, compact, aired = "Out now" }: { at: number; className?: string; compact?: boolean; aired?: string }) {
  const now = useNow();
  if (now === null) return <span className={cn("font-mono tabular-nums opacity-60", className)}>--:--:--</span>;
  let s = Math.floor(at - now / 1000);
  if (s <= 0) return <span className={cn("font-bold", className)}>{aired}</span>;
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  if (compact) return <span className={cn("font-mono tabular-nums", className)}>{d ? `${d}d ${h}h` : h ? `${h}h ${two(m)}m` : `${m}m ${two(s)}s`}</span>;
  return <span className={cn("font-mono tabular-nums", className)}>{d ? `${d}d ` : ""}{two(h)}:{two(m)}:{two(s)}</span>;
}

/** A time in the viewer's own zone (rendered on the client so it's never the server's). */
export function LocalTime({ at, opts, className }: { at: number; opts?: Intl.DateTimeFormatOptions; className?: string }) {
  const now = useNow();
  if (now === null) return <span className={className}>&nbsp;</span>;
  return <time dateTime={new Date(at * 1000).toISOString()} className={className}>{new Date(at * 1000).toLocaleString(undefined, opts ?? { weekday: "short", hour: "numeric", minute: "2-digit" })}</time>;
}
