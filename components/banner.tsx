"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Wide art: the trailer's max-res still when YouTube has one, else the poster, blurred to fill. */
export function Banner({ src, fallback, className, eager }: { src: string | null; fallback: string | null; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(!src);
  const url = failed ? fallback : src;
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={url}
      src={url}
      alt=""
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      onLoad={(e) => {
        // YouTube answers a missing maxres still with a 120×90 grey card, not a 404
        if (!failed && e.currentTarget.naturalWidth <= 120) setFailed(true);
      }}
      className={cn("absolute inset-0 size-full object-cover animate-in fade-in duration-700", failed && "scale-110 blur-2xl saturate-150", className)}
    />
  );
}
