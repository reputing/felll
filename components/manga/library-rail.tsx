"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Poster } from "@/components/poster";

interface Saved { manga_id: string; title: string; cover: string | null; status: string | null }

// A member's saved manga, shown on the manga landing page. Hidden until they
// save something.
export function MangaLibraryRail() {
  const [lib, setLib] = useState<Saved[] | null>(null);
  useEffect(() => {
    fetch("/api/manga/library").then((r) => (r.ok ? r.json() : null)).then((d) => setLib(d?.library ?? [])).catch(() => setLib([]));
  }, []);
  if (!lib || lib.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="px-1"><div className="eyebrow">Your library</div><h2 className="mt-1 text-xl font-extrabold tracking-[-.6px]">Saved manga</h2></div>
      <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
        {lib.map((m) => (
          <Link key={m.manga_id} href={`/manga/${m.manga_id}`} className="group w-[128px] flex-none">
            <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-1.5 border-line transition group-hover:-translate-y-1 group-hover:border-frost-hot">
              <Poster src={m.cover} className="size-full" />
            </div>
            <div className="mt-1.5 line-clamp-2 px-0.5 text-[12.5px] font-extrabold leading-tight">{m.title}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
