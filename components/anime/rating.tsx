"use client";
import { Star, X } from "lucide-react";
import { useState } from "react";
import { saveEntry, useBox, type AnimeRef } from "@/lib/store";
import { cn } from "@/lib/utils";

const WORDS = ["", "Appalling", "Horrible", "Very bad", "Bad", "Average", "Fine", "Good", "Very good", "Great", "Masterpiece"];

/** Ten-point rating: hover to preview, click to set, × to clear. */
export function RatingPicker({ anime }: { anime: AnimeRef }) {
  const score = useBox((s) => s.lib[anime.id]?.score ?? null);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? score ?? 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Your rating</span>
        <span className="text-[12px] font-bold text-frost-text">{shown ? `${shown}/10 · ${WORDS[shown]}` : "Not rated"}</span>
      </div>
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)} role="radiogroup" aria-label="Rate out of 10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={score === n} aria-label={`${n} out of 10`}
            onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(null)}
            onClick={() => saveEntry(anime, { score: n }, `Rated ${n}/10`)}
            className="grid h-9 flex-1 place-items-center rounded-lg transition hover:scale-110">
            <Star className={cn("size-[22px] transition-colors", n <= shown ? "fill-sprinkle-star text-sprinkle-star" : "text-line-hot")} strokeWidth={2} />
          </button>
        ))}
        {score != null && (
          <button type="button" aria-label="Clear rating" onClick={() => saveEntry(anime, { score: null }, "Rating cleared")} className="ml-1 grid size-8 place-items-center rounded-full text-plum-muted hover:bg-cream-tint hover:text-frost-text">
            <X className="size-3.5" strokeWidth={2.8} />
          </button>
        )}
      </div>
    </div>
  );
}
