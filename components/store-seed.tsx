"use client";
import { useRef } from "react";
import { set, type Entry } from "@/lib/store";

/** Puts the member's library into the client store before first paint. */
export function StoreSeed({ lib }: { lib: Record<number, Entry> }) {
  const done = useRef(false);
  // client only: the server's copy of the store module is shared by every request
  if (!done.current && typeof window !== "undefined") {
    done.current = true;
    set({ lib, seeded: true });
  }
  return null;
}
