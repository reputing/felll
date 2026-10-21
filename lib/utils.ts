import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const compact = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function ago(unix: number, from = Date.now() / 1000): string {
  const s = Math.max(0, Math.floor(from - unix));
  if (s < 60) return "just now";
  const units: [number, string][] = [[31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"], [60, "m"]];
  for (const [n, u] of units) if (s >= n) return `${Math.floor(s / n)}${u} ago`;
  return "just now";
}

export const clock = (s: number) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${m}:${pad2(s % 60)}`;
};

export const STATUS_LABEL = {
  watching: "Watching",
  planning: "Plan to watch",
  completed: "Completed",
  paused: "On hold",
  dropped: "Dropped",
} as const;
export type ListStatus = keyof typeof STATUS_LABEL;
export const STATUSES = Object.keys(STATUS_LABEL) as ListStatus[];

export const isStatus = (s: unknown): s is ListStatus => typeof s === "string" && s in STATUS_LABEL;

/** Minutes in a Jikan duration like "24 min per ep" or "1 hr 50 min". */
export function durationMinutes(d: string): number {
  const h = Number(d.match(/(\d+)\s*hr/)?.[1] ?? 0);
  const m = Number(d.match(/(\d+)\s*min/)?.[1] ?? 0);
  return h * 60 + m || 24;
}
