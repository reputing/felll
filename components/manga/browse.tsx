"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Search, X } from "lucide-react";
import { Poster } from "@/components/poster";
import { popularManga, searchManga, type MangaCard } from "@/lib/manga";

interface Reading { manga_id: string; chapter_id: string; chapter_num: string; page: number; title: string; cover: string | null }

function Card({ m }: { m: MangaCard }) {
  return (
    <Link href={`/manga/${m.id}`} className="group flex flex-col gap-1.5">
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-1.5 border-line shadow-poster transition group-hover:-translate-y-1 group-hover:border-frost-hot">
        <Poster src={m.cover} className="size-full" />
      </div>
      <div className="line-clamp-2 text-[13px] font-extrabold leading-tight">{m.title}</div>
    </Link>
  );
}

export function MangaBrowse() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<MangaCard[] | null>(null);
  const [reading, setReading] = useState<Reading[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    fetch("/api/manga-progress").then((r) => (r.ok ? r.json() : null)).then((d) => setReading(d?.reading ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setList(null);
      (q.trim() ? searchManga(q) : popularManga(36)).then(setList).catch(() => setList([]));
    }, q.trim() ? 350 : 0);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div className="flex flex-col gap-6">
      <div className="relative max-w-[460px]">
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-plum-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search manga…" aria-label="Search manga"
          className="h-12 w-full rounded-full border-1.5 border-line bg-cream-card pl-11 pr-11 text-[14px] font-semibold outline-none transition focus:border-frost-hot focus:shadow-halo" />
        {q && <button type="button" onClick={() => setQ("")} aria-label="Clear" className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full hover:bg-cream-tint"><X className="size-4" /></button>}
      </div>

      {!q && reading.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="eyebrow flex items-center gap-1.5"><BookOpen className="size-3.5" />Continue reading</div>
          <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
            {reading.map((r) => (
              <Link key={r.manga_id} href={`/manga/${r.manga_id}/${r.chapter_id}`} className="group w-[128px] flex-none">
                <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-1.5 border-line transition group-hover:-translate-y-1">
                  <Poster src={r.cover} className="size-full" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 py-1.5 text-[11px] font-extrabold text-white">Ch. {r.chapter_num || "?"} · p{r.page + 1}</span>
                </div>
                <div className="mt-1 line-clamp-1 text-[12px] font-bold">{r.title}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="eyebrow">{q.trim() ? "Results" : "Popular now"}</div>
        {list === null ? (
          <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-cream-card" />)}
          </div>
        ) : list.length ? (
          <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4 lg:grid-cols-6">
            {list.map((m) => <Card key={m.id} m={m} />)}
          </div>
        ) : (
          <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">Nothing found. Try another title.</p>
        )}
      </section>
    </div>
  );
}
