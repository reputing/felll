import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SOURCES } from "@/lib/manga-sources";

// Links to the extra per-source catalogues (VortexScans, Omega). These live in
// their own sections because they have their own catalogues, separate from the
// MangaDex browse above.
export function MoreSources() {
  return (
    <section className="flex flex-col gap-3">
      <div className="eyebrow px-1">More sources</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.values(SOURCES).map((s) => (
          <Link key={s.id} href={`/read/${s.id}`}
            className="group flex items-center gap-3 rounded-box border-1.5 border-line bg-cream-card p-4 transition hover:border-frost-hot">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-extrabold">{s.name}</span>
                {s.adult && <span className="rounded-full bg-cream-blush px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[.08em] text-frost-text">18+</span>}
              </div>
              <div className="truncate text-[12.5px] font-semibold text-plum-muted">{s.blurb}</div>
            </div>
            <ArrowRight className="size-4 flex-none text-plum-muted transition group-hover:translate-x-0.5 group-hover:text-frost-text" />
          </Link>
        ))}
      </div>
    </section>
  );
}
