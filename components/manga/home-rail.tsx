"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { Poster } from "@/components/poster";
import { popularManga, type MangaCard } from "@/lib/manga";

interface Reading { manga_id: string; chapter_id: string; chapter_num: string; page: number; title: string; cover: string | null }

function Row({ eyebrow, title, children, href }: { eyebrow: string; title: string; children: React.ReactNode; href: string }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between px-1">
        <div><div className="eyebrow">{eyebrow}</div><h2 className="mt-1 text-xl font-extrabold tracking-[-.6px]">{title}</h2></div>
        <Link href={href} className="flex items-center gap-1 text-[12.5px] font-bold text-frost-text hover:text-frost-deep">All manga<ChevronRight className="size-3.5" strokeWidth={2.6} /></Link>
      </div>
      <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">{children}</div>
    </section>
  );
}

/** "Keep reading": your resume points, with a way to take one off. Its own home section so it can sit near the top. */
export function MangaKeepReading() {
  const [reading, setReading] = useState<Reading[]>([]);
  const [tracked, setTracked] = useState<{ anilist_id: number; title: string; cover: string | null; progress: number }[]>([]);
  useEffect(() => {
    fetch("/api/manga-progress").then((r) => (r.ok ? r.json() : null)).then((d) => { setReading(d?.reading ?? []); setTracked(d?.tracked ?? []); }).catch(() => {});
  }, []);
  // AniList titles you haven't opened here yet; anything with a resume point above wins
  const seen = new Set(reading.map((r) => r.title.toLowerCase()));
  const extra = tracked.filter((t) => !seen.has(t.title.toLowerCase()));
  if (!reading.length && !extra.length) return null;
  const remove = (id: string) => {
    setReading((x) => x.filter((r) => r.manga_id !== id));
    fetch(`/api/manga-progress?mangaId=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  };
  return (
    <Row eyebrow="On your shelf" title="Keep reading" href="/manga">
      {reading.map((r) => (
        <div key={r.manga_id} className="group relative w-[128px] flex-none">
          <Link href={`/manga/${r.manga_id}/${r.chapter_id}`} className="block">
            <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-1.5 border-line transition group-hover:-translate-y-1">
              <Poster src={r.cover} className="size-full" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 py-1.5 text-[11px] font-extrabold text-white">Ch. {r.chapter_num || "?"} · p{r.page + 1}</span>
            </div>
            <div className="mt-1 line-clamp-1 text-[12px] font-bold">{r.title}</div>
          </Link>
          <button type="button" onClick={() => remove(r.manga_id)} aria-label={`Remove ${r.title}`} title="remove from keep reading"
            className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/65 text-white opacity-0 backdrop-blur transition hover:bg-black/85 focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {extra.map((t) => (
        <Link key={`al${t.anilist_id}`} href={`/api/manga/resolve?title=${encodeURIComponent(t.title)}&ch=${t.progress}`} prefetch={false} className="group w-[128px] flex-none">
          <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-1.5 border-line transition group-hover:-translate-y-1">
            <Poster src={t.cover} className="size-full" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 py-1.5 text-[11px] font-extrabold text-white">Ch. {t.progress} · AniList</span>
          </div>
          <div className="mt-1 line-clamp-1 text-[12px] font-bold">{t.title}</div>
        </Link>
      ))}
    </Row>
  );
}

export function MangaPopular() {
  const [pop, setPop] = useState<MangaCard[] | null>(null);
  useEffect(() => { popularManga(14).then(setPop).catch(() => setPop([])); }, []);
  if (pop !== null && pop.length === 0) return null;
  return (
    <Row eyebrow="Cupcake / read" title="Popular manga" href="/manga">
      {(pop ?? Array.from({ length: 8 }).map(() => null)).map((m, i) =>
        m ? (
          <Link key={m.id} href={`/manga/${m.id}`} className="group w-[128px] flex-none">
            <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-1.5 border-line shadow-poster transition group-hover:-translate-y-1 group-hover:border-frost-hot">
              <Poster src={m.cover} className="size-full" />
            </div>
            <div className="mt-1 line-clamp-2 text-[12px] font-bold leading-tight">{m.title}</div>
          </Link>
        ) : (
          <div key={i} className="aspect-[2/3] w-[128px] flex-none animate-pulse rounded-2xl bg-cream-card" />
        ),
      )}
    </Row>
  );
}
