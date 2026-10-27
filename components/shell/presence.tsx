"use client";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

// Heartbeat every 30s while the tab is visible. The server answers with who
// is around and what they're watching; the header pill and the watch page
// read it from here.

export interface Online {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  mal_id: number | null;
  episode: number | null;
  title: string | null;
  manga_id: string | null;
}
type Snapshot = { count: number; people: Online[] };

let snap: Snapshot = { count: 0, people: [] };
const subs = new Set<() => void>();
let watching: { malId: number; episode: number; title: string } | null = null;
let reading: { mangaId: string; title: string } | null = null;
let beat: (() => void) | null = null;

export function usePresence(): Snapshot {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => snap, () => snap);
}

/** The watch page says what's playing; sent with the next heartbeat (right away). */
export function setWatching(w: typeof watching) {
  watching = w;
  beat?.();
}

/** The manga reader says what's being read; sent with the next heartbeat. */
export function setReading(r: typeof reading) {
  reading = r;
  beat?.();
}

export function PresenceBeacon() {
  const path = usePathname();
  useEffect(() => {
    const reader = /^\/manga\/[^/]+\/[^/]+/.test(path);
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    let last = 0; // when we last actually POSTed
    const INTERVAL = 30_000;
    const send = async () => {
      clearTimeout(t);
      if (stop) return;
      // Mount, a path change, setReading and setWatching all poke this in quick
      // succession. Coalesce that burst: if we posted a few seconds ago, just
      // make sure the next heartbeat is scheduled instead of firing again.
      const since = Date.now() - last;
      if (last !== 0 && since < 4000) { t = setTimeout(send, INTERVAL - since); return; }
      if (document.visibilityState === "visible") {
        last = Date.now();
        // What they're doing: watching on /watch, reading on the manga reader.
        const doing = watching && path.startsWith("/watch") ? watching : reader && reading ? reading : {};
        const res = await fetch("/api/presence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path, ...doing }),
          keepalive: true,
        }).catch(() => null);
        if (res?.ok) {
          snap = await res.json();
          subs.forEach((f) => f());
        }
      }
      t = setTimeout(send, INTERVAL);
    };
    beat = send;
    send();
    const onVis = () => document.visibilityState === "visible" && send();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; clearTimeout(t); beat = null; document.removeEventListener("visibilitychange", onVis); };
  }, [path]);
  return null;
}
