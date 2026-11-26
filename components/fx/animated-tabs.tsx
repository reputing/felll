"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** A tab strip whose highlight glides to the chosen tab (the "expandable / animated tabs" pattern). Controlled: the caller owns `value`. */
export function AnimatedTabs<T extends string>({ tabs, value, onChange, label, className }: {
  tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string; className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = refs.current[value];
    if (el) setBox({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value, tabs]);
  return (
    <div role="tablist" aria-label={label} className={cn("glass relative inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full p-1 scrollbar-none", className)}>
      {box && <span aria-hidden className="absolute inset-y-1 rounded-full bg-frost shadow-[0_6px_18px_-6px_rgb(var(--glow)/.7)] transition-all duration-300 ease-[cubic-bezier(.3,.9,.3,1)]" style={{ left: box.x, width: box.w }} />}
      {tabs.map((t) => (
        <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} type="button" role="tab" aria-selected={t.id === value} onClick={() => onChange(t.id)}
          className={cn("relative z-10 h-9 flex-1 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-extrabold transition-colors sm:flex-none sm:px-4 sm:text-[13px]", t.id === value ? "text-frost-ink" : "text-plum-body hover:text-plum")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
