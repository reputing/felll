"use client";
import { useSyncExternalStore } from "react";

// A personal "watch next" queue, kept in this browser (no account round-trip).
// Add from a show page; it shows up as a rail on the home page.

export interface QueueItem {
  id: number;
  title: string;
  image: string | null;
}

const KEY = "cupcake:queue";
let cache: QueueItem[] | null = null;
const subs = new Set<() => void>();

function read(): QueueItem[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    cache = [];
  }
  return cache!;
}

function write(next: QueueItem[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage off */
  }
  subs.forEach((f) => f());
}

export function addToQueue(item: QueueItem) {
  const q = read();
  if (q.some((x) => x.id === item.id)) return;
  write([...q, item]);
}

export function removeFromQueue(id: number) {
  write(read().filter((x) => x.id !== id));
}

export function useQueue(): QueueItem[] {
  // server snapshot is empty so hydration matches; the real list loads on the client
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, read, () => []);
}
