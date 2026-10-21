import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pager({ page, last, href }: { page: number; last: number; href: (p: number) => string }) {
  if (last <= 1) return null;
  const pages = [...new Set([1, page - 1, page, page + 1, last].filter((p) => p >= 1 && p <= last))].sort((a, b) => a - b);
  const btn = "grid h-10 min-w-10 place-items-center rounded-full border-1.5 border-line bg-cream-card px-3 text-[13.5px] font-bold hover:border-frost-hot";
  return (
    <nav aria-label="pages" className="flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 && <Link className={btn} href={href(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Link>}
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - pages[i - 1] > 1 && <span className="text-plum-faint">…</span>}
          <Link className={cn(btn, p === page && "border-frost-hot bg-frost text-frost-ink")} href={href(p)} aria-current={p === page ? "page" : undefined}>{p}</Link>
        </span>
      ))}
      {page < last && <Link className={btn} href={href(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Link>}
    </nav>
  );
}
