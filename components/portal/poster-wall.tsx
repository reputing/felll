import type { Anime } from "@/lib/jikan";

// Three slow rows of posters drifting behind the portal card.
export function PosterWall({ items }: { items: Anime[] }) {
  const pool = items.filter((a) => a.posterSm);
  if (pool.length < 6) return null;
  const rows = [0, 1, 2].map((r) => {
    const row = pool.filter((_, i) => i % 3 === r);
    return [...row, ...row];
  });
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(ellipse_at_center,transparent_18%,black_72%)]">
      <div className="absolute -inset-x-40 top-1/2 flex -translate-y-1/2 -rotate-[8deg] flex-col gap-5 opacity-60">
        {rows.map((row, r) => (
          <div key={r} className={r % 2 ? "flex w-max gap-5 animate-marquee-rev" : "flex w-max gap-5 animate-marquee"} style={{ ["--marquee-dur" as string]: `${90 + r * 25}s` }}>
            {row.map((a, i) => (
              <span key={i} className="relative h-[230px] w-[160px] flex-none overflow-hidden rounded-[22px] border-1.5 border-line bg-cream-blush shadow-poster">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.posterSm!} alt="" loading={i < 8 ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" className="size-full object-cover" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
