"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, Play } from "lucide-react";
import { Poster } from "@/components/poster";
import { Button } from "@/components/ui/button";
import { Comments } from "@/components/comments/comments";
import { MangaSaveButton } from "@/components/manga/save-button";
import { getChapters, getManga, mangaStatusLabel, type Chapter, type MangaFull } from "@/lib/manga";

export function MangaDetail({ id }: { id: string }) {
  const [m, setM] = useState<MangaFull | null | "loading">("loading");
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [resume, setResume] = useState<{ chapter_id: string; chapter_num: string; page: number } | null>(null);

  useEffect(() => {
    getManga(id).then((x) => setM(x)).catch(() => setM(null));
    getChapters(id).then(setChapters).catch(() => setChapters([]));
    fetch(`/api/manga-progress?mangaId=${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => setResume(d?.progress ?? null)).catch(() => {});
  }, [id]);

  if (m === "loading") return <div className="h-64 animate-pulse rounded-shell bg-cream-card" />;
  if (!m) return <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">Couldn’t load this title.</p>;

  const first = chapters?.[0];
  const resumeCh = resume && chapters?.find((c) => c.id === resume.chapter_id);
  const startHref = resumeCh ? `/manga/${id}/${resume!.chapter_id}` : first ? `/manga/${id}/${first.id}` : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-shell border-1.5 border-night-line bg-night text-night-text">
        <div aria-hidden className="absolute inset-0 opacity-30"><Poster src={m.cover} className="size-full blur-2xl saturate-150" /></div>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-night via-night/80 to-night/40" />
        <div className="relative grid gap-6 p-5 sm:p-8 md:grid-cols-[200px_1fr]">
          <Poster src={m.cover} className="mx-auto aspect-[2/3] w-[170px] rounded-[20px] border-1.5 border-night-edge shadow-[0_24px_40px_-18px_rgba(0,0,0,.8)] md:w-[200px]" />
          <div className="flex min-w-0 flex-col justify-end gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-frost">
              <span>Manga{m.year ? ` · ${m.year}` : ""}</span>
              <span className="rounded-full border border-night-edge px-2 py-0.5 text-night-text">{mangaStatusLabel(m.status)}</span>
              <span className="rounded-full border border-night-edge px-2 py-0.5 text-night-text">via Cupcake</span>
            </div>
            <h1 className="text-balance text-[clamp(26px,4vw,44px)] font-extrabold leading-[1.02] tracking-[-1.4px]">{m.title}</h1>
            {m.altTitle && <p className="text-[13px] font-medium text-night-muted">{m.altTitle}</p>}
            {m.author && <p className="text-[12.5px] font-semibold text-night-muted">by {m.author}</p>}
            <div className="flex flex-wrap gap-1.5">
              {m.tags.slice(0, 6).map((t) => <span key={t} className="rounded-full border border-night-line px-2.5 py-0.5 text-[11.5px] font-bold text-night-text/90">{t}</span>)}
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              {startHref && (
                <Button size="lg" asChild className="font-extrabold">
                  <Link href={startHref}><Play className="size-4" fill="currentColor" />{resumeCh ? `Continue · Ch. ${resume!.chapter_num || resumeCh.chapter}` : "Start reading"}</Link>
                </Button>
              )}
              <MangaSaveButton manga={m} />
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
        <div className="mb-4 flex items-center gap-2"><BookOpen className="size-4 text-frost-text" /><h2 className="text-xl font-extrabold tracking-[-.6px]">Chapters</h2>{chapters && <span className="font-mono text-[13px] text-plum-muted">{chapters.length}</span>}</div>
        {chapters === null ? (
          <div className="flex flex-col gap-1.5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-paper" />)}</div>
        ) : chapters.length === 0 ? (
          <p className="text-[13.5px] font-semibold text-plum-muted">No English chapters hosted here yet.</p>
        ) : (
          <ol className="scrollbar-none grid max-h-[560px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {chapters.map((c) => {
              const read = resume?.chapter_id === c.id;
              return (
                <li key={c.id}>
                  <Link href={`/manga/${id}/${c.id}`} className={cnc(read)}>
                    <span className="grid size-9 flex-none place-items-center rounded-lg bg-cream-tint font-mono text-[12.5px] text-frost-text">{c.chapter || "–"}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-extrabold">{c.title || `Chapter ${c.chapter || "?"}`}</span>
                      <span className="block truncate text-[11.5px] font-semibold text-plum-muted">{c.pages} pages{c.group ? ` · ${c.group}` : ""}</span>
                    </span>
                    {read && <span className="ml-auto text-[10.5px] font-extrabold uppercase tracking-[.08em] text-frost-text">reading</span>}
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <Comments api="/api/manga/comments" scope={{ mangaId: m.id }} title={m.title} image={m.cover} heading={`${m.title} talk`} />
    </div>
  );
}

const cnc = (read: boolean) =>
  `group grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-2xl border-1.5 p-2 pr-3 transition hover:border-frost-hot ${read ? "border-frost-hot bg-cream-blush" : "border-line-soft bg-paper"}`;
