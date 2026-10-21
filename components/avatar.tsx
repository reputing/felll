import { cn } from "@/lib/utils";

export function Avatar({ src, name, size = 36, className, ring }: { src: string | null | undefined; name: string; size?: number; className?: string; ring?: string }) {
  const initial = (name || "?").replace(/^@/, "").charAt(0).toUpperCase();
  return (
    <span
      className={cn("relative inline-grid flex-none place-items-center overflow-hidden rounded-full bg-cream-blush font-extrabold text-frost-text", className)}
      style={{ width: size, height: size, fontSize: size * 0.42, boxShadow: ring ? `0 0 0 2px var(--cream-card), 0 0 0 4px ${ring}` : undefined }}
    >
      {initial}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
      )}
    </span>
  );
}
