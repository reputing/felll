import { cn } from "@/lib/utils";

// Plain <img>: Next's optimiser isn't available on Workers without the Images
// binding, and MAL's CDN already serves right-sized webp. Lazy by default; pass
// eager for anything above the fold.
export function Poster({
  src, alt = "", color, className, eager, sizes,
}: { src: string | null | undefined; alt?: string; color?: string; className?: string; eager?: boolean; sizes?: string }) {
  return (
    <span className={cn("relative block overflow-hidden", className)} style={{ background: color ?? "var(--cream-blush)" }}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          sizes={sizes}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}
