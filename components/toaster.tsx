"use client";
import { Sparkles } from "lucide-react";
import { useBox } from "@/lib/store";

export function Toaster() {
  const t = useBox((s) => s.toast);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      {t && (
        <div key={t.id} className="flex items-center gap-2.5 rounded-full border-1.5 border-line bg-cream-card px-5 py-3 text-[13.5px] font-bold text-plum shadow-lift animate-in fade-in slide-in-from-bottom-3">
          <Sparkles className="size-4 text-frost-hot" /> {t.text}
        </div>
      )}
    </div>
  );
}
