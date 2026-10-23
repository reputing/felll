"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, Star } from "lucide-react";
import { Poster } from "@/components/poster";
import { cn } from "@/lib/utils";
import type { MovieCard } from "@/lib/movies";

const TABS = [
  { v: "all", label: "All" },
  { v: "movie", label: "Movies" },
  { v: "tv", label: "TV series" },
  { v: "anime", label: "Anime" },
] as const;

export function MovieBrowse() {
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MovieCard[] | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { setPage(1); }, [type, q]);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setItems(null);
      const qs = new URLSearchParams({ type, sort: "rating", page: String(page) });
      if (q.trim()) qs.set("q", q.trim());
      fetch(`/api/movie/catalog?${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { setItems(d?.items ?? []); setTotalPages(d?.totalPages ?? 1); })
        .catch(() => setItems([]));
    }, q ? 350 : 0);
    return () => clearTimeout(debounce.current);
  }, [type, q, page]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.v} type="button" aria-pressed={type === t.v} onClick={() => setType(t.v)}
            className={cn("h-[42px] rounded-full border-1.5 border-line bg-cream-card px-5 text-[13.5px] font-bold hover:border-frost-hot", type === t.v && "border-frost-hot bg-frost text-frost-ink")}>
            {t.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-plum-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search movies & series…" aria-label="Search"
            className="h-[42px] w-[220px] max-w-full rounded-full border-1.5 border-line bg-cream-card pl-10 pr-4 text-[13.5px] font-semibold outline-none focus:border-frost-hot" />
        </div>
      </div>

      {items === null ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5">
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-[2/3] rounded-2xl skeleton" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">
          {q.trim() ? `Nothing matches “${q.trim()}”.` : "No titles here yet."}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5">
          {items.map((m) => (
            <Link key={m.id + m.slug} href={`/movies/${m.slug}?sid=${encodeURIComponent(m.id)}&t=${encodeURIComponent(m.title)}`} className="group flex flex-col gap-2">
              <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-1.5 border-line transition group-hover:-translate-y-1 group-hover:border-frost-hot">
                <Poster src={m.poster} className="size-full" />
                {m.rating && <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-lg bg-black/70 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white backdrop-blur"><Star className="size-3 text-sprinkle-star" fill="currentColor" />{m.rating}</span>}
                {m.badge && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-frost/90 px-1.5 py-0.5 text-[10px] font-extrabold text-frost-ink">{m.badge}</span>}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-extrabold leading-tight">{m.title}</div>
                <div className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-plum-muted">{m.type === "tv" ? "Series" : m.type}{m.year ? ` · ${m.year}` : ""}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && items && items.length > 0 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-10 rounded-full border-1.5 border-line bg-cream-card px-5 text-[13px] font-bold disabled:opacity-40 hover:border-frost-hot">Prev</button>
          <span className="font-mono text-[13px] text-plum-muted">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-10 rounded-full border-1.5 border-line bg-cream-card px-5 text-[13px] font-bold disabled:opacity-40 hover:border-frost-hot">Next</button>
        </div>
      )}
    </div>
  );
}
