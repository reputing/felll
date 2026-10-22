"use client";
import { useSyncExternalStore } from "react";
import type { Group } from "./jikan";
import type { ListStatus } from "./utils";
import type { AnimeRef } from "./anime-ref";

export type { AnimeRef };

// One tiny client store. Search and filters (header, sidebar, catalog, closer
// look) live here, and so does the member's library, seeded from the server by
// <StoreSeed> and changed optimistically by the buttons that edit it.

export type Sort = "rec" | "score" | "az" | "members";
export interface Entry {
  status: ListStatus | null;
  score: number | null;
  favorite: boolean;
  progress: number;
}

/** What's playing right now, so the mini-player can keep it going off-page. */
export interface NowPlaying {
  sourceId: string | number;
  malId: number;
  ep: number;
  title: string;
  image: string | null;
  episodes: number | null;
  format: string;
  href: string;
  position: number;
  paused: boolean;
}

type State = {
  q: string;
  fmt: "all" | Group;
  genres: string[];
  sort: Sort;
  savedOnly: boolean;
  sel: number | null;
  dub: boolean;
  limit: number;
  lib: Record<number, Entry>;
  toast: { id: number; text: string } | null;
  palette: boolean;
  seeded: boolean;
  mini: NowPlaying | null;
};

let state: State = {
  q: "", fmt: "all", genres: [], sort: "rec", savedOnly: false, sel: null, dub: false, limit: 12,
  lib: {}, toast: null, palette: false, seeded: false, mini: null,
};
const SERVER = state;
const subs = new Set<() => void>();

export function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  const resets = ["q", "fmt", "genres", "sort", "savedOnly"].some((k) => k in p);
  state = { ...state, ...(resets ? { limit: 12 } : {}), ...p };
  subs.forEach((f) => f());
}

export function useBox<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    () => pick(state),
    () => pick(SERVER),
  );
}

/** Publish/refresh what's playing (from the inline player). */
export function setMini(patch: Partial<NowPlaying> | null) {
  if (patch === null) { set({ mini: null }); return; }
  set((s) => ({ mini: s.mini ? { ...s.mini, ...patch } : (patch as NowPlaying) }));
}

let toastId = 0;
export function toast(text: string) {
  const id = ++toastId;
  set({ toast: { id, text } });
  setTimeout(() => { if (state.toast?.id === id) set({ toast: null }); }, 2600);
}

const EMPTY: Entry = { status: null, score: null, favorite: false, progress: 0 };

/** Change a library entry: the UI updates now, the server catches up. */
export async function saveEntry(a: AnimeRef, patch: Partial<Entry>, message?: string) {
  const before = state.lib[a.id];
  const next = { ...EMPTY, ...before, ...patch };
  const lib = { ...state.lib };
  if (!next.status && !next.score && !next.favorite) delete lib[a.id];
  else lib[a.id] = next;
  set({ lib });
  try {
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ anime: a, ...patch }),
    });
    if (!res.ok) throw new Error();
    if (message) toast(message);
  } catch {
    set((s) => {
      const lib = { ...s.lib };
      if (before) lib[a.id] = before;
      else delete lib[a.id];
      return { lib };
    });
    toast("Couldn’t save that, try again");
  }
}

export const actions = {
  toggleSave: (a: AnimeRef) => {
    const on = !!state.lib[a.id]?.status;
    return saveEntry(a, { status: on ? null : "planning" }, on ? "Removed from your box" : "Saved to your box");
  },
  toggleGenre: (g: string) => set((s) => ({ genres: s.genres.includes(g) ? s.genres.filter((x) => x !== g) : [...s.genres, g] })),
  clear: () => set({ q: "", fmt: "all", genres: [], savedOnly: false }),
};

