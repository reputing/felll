"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, Play } from "lucide-react";
import { Poster } from "@/components/poster";
import { sourceDetail, SOURCES, type SourceId, type SrcDetail } from "@/lib/manga-sources";

export function SourceDetail({ source, slug }: { source: SourceId; slug: string }) {
  const [m, setM] = useState<SrcDetail | null | "loading">("loading");
  useEffect(() => { sourceDetail(source, slug).then(setM).catch(() => setM(null)); }, [source, slug]);

  if (m === "loading") return <div className="h-64 animate-pulse rounded-shell bg-cream-card" />;
  if (!m) return <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">Couldn’t load this title.</p>;

  const first = m.chapters[0];
  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-shell border-1.5 border-night-line bg-night text-night-text">
        <div aria-hidden className="absolute inset-0 opacity-30"><Poster src={m.cover} className="size-full blur-2xl saturate-150" /></div>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-night via-night/80 to-night/40" />
        <div className="relative grid gap-6 p-5 sm:p-8 md:grid-cols-[200px_1fr]">
          <Poster src={m.cover} className="mx-auto aspect-[2/3] w-[170px] rounded-[20px] border-1.5 border-night-edge shadow-[0_24px_40px_-18px_rgba(0,0,0,.8)] md:w-[200px]" />
          <div className="flex min-w-0 flex-col justify-end gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-frost">
              <span>Manhwa</span>
              {m.status && <span className="rounded-full border border-night-edge px-2 py-0.5 text-night-text">{m.status}</span>}
              <span className="rounded-full border border-night-edge px-2 py-0.5 text-night-text">via {SOURCES[source].name}</span>
            </div>
            <h1 className="text-balance text-[clamp(26px,4vw,44px)] font-extrabold leading-[1.02] tracking-[-1.4px]">{m.title}</h1>
            <div className="mt-1 flex flex-wrap gap-2">
              {first && (
                <Link href={`/read/${source}/${encodeURIComponent(m.slug)}/${encodeURIComponent(first.slug)}`}
                  className="flex h-11 items-center gap-2 rounded-full bg-frost px-5 font-extrabold text-frost-ink transition hover:brightness-105">
                  <Play className="size-4" fill="currentColor" />Start reading
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {m.description && (
        <section className="rounded-box border-1.5 border-line bg-cream-card p-5 sm:p-6">
          <div className="eyebrow">Synopsis</div>
          <p className="mt-2 whitespace-pre-line text-pretty text-[14.5px] leading-relaxed text-plum-body line-clamp-6">{m.description}</p>
        </section>
      )}

      <section className="rounded-box border-1.5 border-line bg-cream-card p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <BookOpen className="size-4 text-frost-text" /><h2 className="text-xl font-extrabold tracking-[-.6px]">Chapters</h2>
          <span className="font-mono text-[13px] text-plum-muted">{m.chapters.length}</span>
        </div>
        {m.chapters.length === 0 ? (
          <p className="text-[13.5px] font-semibold text-plum-muted">No chapters available.</p>
        ) : (
          <ol className="scrollbar-none grid max-h-[560px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {m.chapters.map((c) => (
              <li key={c.slug}>
                <Link href={`/read/${source}/${encodeURIComponent(m.slug)}/${encodeURIComponent(c.slug)}`}
                  className="group grid grid-cols-[36px_1fr] items-center gap-3 rounded-2xl border-1.5 border-line-soft bg-paper p-2 pr-3 transition hover:border-frost-hot">
                  <span className="grid size-9 flex-none place-items-center rounded-lg bg-cream-tint font-mono text-[12.5px] text-frost-text">{c.number || "–"}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-extrabold">{c.title || `Chapter ${c.number || "?"}`}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
