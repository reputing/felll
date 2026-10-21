"use client";
import * as T from "@radix-ui/react-tooltip";

export function Tip({ label, children, side = "top" }: { label: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Provider delayDuration={200}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content side={side} sideOffset={6} className="z-50 rounded-xl border-1.5 border-line bg-cream-card px-2.5 py-1.5 text-[12px] font-bold text-plum shadow-shell data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95">
            {label}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}
