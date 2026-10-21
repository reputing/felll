"use client";
import { SaveIcon } from "@/components/icons";
import { actions, useBox, type AnimeRef } from "@/lib/store";
import { cn } from "@/lib/utils";

export function SaveToggle({ a }: { a: AnimeRef }) {
  const saved = useBox((s) => !!s.lib[a.id]?.status);
  return (
    <button type="button" aria-pressed={saved} aria-label={saved ? `Remove ${a.title}` : `Save ${a.title}`} onClick={() => actions.toggleSave(a)}
      className={cn("grid size-10 place-items-center rounded-xl border-1.5 border-line bg-paper transition hover:border-frost-hot", saved && "border-frost-hot bg-frost-hot text-white")}>
      <SaveIcon on={saved} className="size-4" />
    </button>
  );
}
