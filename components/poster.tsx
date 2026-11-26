"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Plain <img>: Next's optimiser isn't available on Workers without the Images
// binding, and MAL's CDN already serves right-sized webp. Lazy by default; pass
// eager for anything above the fold. A picture that fails to load is dropped (not left as the
// browser's broken-image icon) so the tile shows its colour and a small mark instead.

// MangaDex covers go through our edge-cached proxy (app/api/manga-img) instead of every
// browser fetching them from MangaDex: far less egress, and no blank tiles when their CDN is slow.
export const coverSrc = (u: string) => (/^https:\/\/uploads\.mangadex\.org\/covers\//i.test(u) ? `/api/manga-img?u=${encodeURIComponent(u)}` : u);

export function Poster({
  src, alt = "", color, className, eager, sizes, fallbackSrc, label,
}: { src: string | null | undefined; alt?: string; color?: string; className?: string; eager?: boolean; sizes?: string; fallbackSrc?: string | null; label?: string }) {
  // `fallbackSrc` is tried when `src` fails (an episode still that does not exist yet falls back to the show's picture); `label` is
  // written on the tile when neither loads, so a missing poster still says what it was
  const [failed, setFailed] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  useEffect(() => { setFailed(false); setUseFallback(false); }, [src, fallbackSrc]);
  const shown = useFallback && fallbackSrc ? fallbackSrc : src;
  return (
    <span className={cn("relative block overflow-hidden", className)} style={{ background: color ?? "var(--cream-blush)" }}>
      {shown && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverSrc(shown)}
          alt={alt}
          sizes={sizes}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => (!useFallback && fallbackSrc ? setUseFallback(true) : setFailed(true))}
          className="absolute inset-0 size-full object-cover"
        />
      ) : failed ? (
        label ? <span className="absolute inset-0 grid place-items-center p-2 text-center text-[11.5px] font-extrabold leading-tight text-plum-muted">{label}</span>
          : <span aria-hidden className="absolute inset-0 grid place-items-center text-[clamp(14px,30%,28px)] text-plum-faint/70">✿</span>
      ) : null}
    </span>
  );
}
