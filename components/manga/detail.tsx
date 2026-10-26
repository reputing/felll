"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Play } from "lucide-react";
import { Poster } from "@/components/poster";
import { Button } from "@/components/ui/button";
import { Comments } from "@/components/comments/comments";
import { MangaSaveButton } from "@/components/manga/save-button";
import { AddToCollection } from "@/components/collections/add-button";
import { cachedChapters, getChapterThumb, getChapters, getManga, langName, mangaStatusLabel, type Chapter, type MangaFull } from "@/lib/manga";

export function MangaDetail({ id }: { id: string }) {
  const [m, setM] = useState<MangaFull | null | "loading">("loading");
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [resume, setResume] = useState<{ chapter_id: string; chapter_num: string; page: number } | null>(null);
  const [lang, setLang] = useState("en");

  // the reader shares this preference, so picking a language here sticks
  useEffect(() => { try { const s = localStorage.getItem("manga:lang"); if (s) setLang(s); } catch { /* */ } }, []);
  const pickLang = (l: string) => { setLang(l); try { localStorage.setItem("manga:lang", l); } catch { /* */ } };

  useEffect(() => {
    getManga(id).then((x) => setM(x)).catch(() => setM(null));
    fetch(`/api/manga-progress?mangaId=${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => setResume(d?.progress ?? null)).catch(() => {});
  }, [id]);
  useEffect(() => {
    // Paint the last-known list instantly (localStorage), then revalidate.
    const cached = cachedChapters(id, lang);
    setChapters(cached);
    getChapters(id, lang).then(setChapters).catch(() => setChapters((prev) => prev ?? []));
  }, [id, lang]);

  if (m === "loading") return <div className="h-64 animate-pulse rounded-shell bg-cream-card" />;
  if (!m) return <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">Couldn’t load this title.</p>;

  const first = chapters?.[0];
  const resumeCh = resume && chapters?.find((c) => c.id === resume.chapter_id);
  const extFirst = first?.external ?? null;
  // The language actually being shown (chapters may fall back if the picked one
  // isn't hosted here). English first in the picker.
  const activeLang = first?.lang ?? lang;
  // English is always offered (it may come from the second source even when
  // MangaDex lists no English for the title), plus every MangaDex language.
  const langs = [...new Set(["en", activeLang, ...(m.languages ?? [])])].sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : langName(a).localeCompare(langName(b))));

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
              {resumeCh ? (
                <Button size="lg" asChild className="font-extrabold">
                  <Link href={`/manga/${id}/${resume!.chapter_id}`}><Play className="size-4" fill="currentColor" />Continue · Ch. {resume!.chapter_num || resumeCh.chapter}</Link>
                </Button>
              ) : extFirst ? (
                <Button size="lg" asChild className="font-extrabold">
                  <a href={extFirst} target="_blank" rel="noreferrer"><Play className="size-4" fill="currentColor" />Read on official site</a>
                </Button>
              ) : first ? (
                <Button size="lg" asChild className="font-extrabold">
                  <Link href={`/manga/${id}/${first.id}`}><Play className="size-4" fill="currentColor" />Start reading</Link>
                </Button>
              ) : null}
              <MangaSaveButton manga={m} />
              <AddToCollection kind="manga" refId={m.id} title={m.title} cover={m.cover} className="h-11 rounded-xl border-night-edge bg-night/40 text-[13.5px] text-night-text backdrop-blur hover:border-frost" />
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
          {chapters && <span className="font-mono text-[13px] text-plum-muted">{chapters.length}</span>}
          {langs.length > 1 && (
            <select value={activeLang} onChange={(e) => pickLang(e.target.value)} aria-label="Chapter language"
              className="ml-auto h-8 rounded-full border-1.5 border-line bg-paper px-3 text-[12.5px] font-bold text-plum outline-none focus:border-frost-hot">
              {langs.map((l) => <option key={l} value={l}>{langName(l)}</option>)}
            </select>
          )}
        </div>
        {chapters === null ? (
          <div className="flex flex-col gap-1.5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-paper" />)}</div>
        ) : chapters.length === 0 ? (
          <p className="text-[13.5px] font-semibold text-plum-muted">No chapters available for this title yet.</p>
        ) : (
          <ol className="scrollbar-none grid max-h-[560px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {chapters.map((c) => {
              const read = resume?.chapter_id === c.id;
              const inner = (
                <>
                  <ChapterThumb c={c} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-extrabold">{c.title || `Chapter ${c.chapter || "?"}`}</span>
                    <span className="block truncate text-[11.5px] font-semibold text-plum-muted">{c.external ? "Official release ↗" : c.pages ? `${c.pages} pages${c.group ? ` · ${c.group}` : ""}` : c.group || "Read"}</span>
                  </span>
                  {read && <span className="ml-auto text-[10.5px] font-extrabold uppercase tracking-[.08em] text-frost-text">reading</span>}
                </>
              );
              return (
                <li key={c.id}>
                  {c.external
                    ? <a href={c.external} target="_blank" rel="noreferrer" className={cnc(read)}>{inner}</a>
                    : <Link href={`/manga/${id}/${c.id}`} className={cnc(read)}>{inner}</Link>}
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

// The little square at the start of a chapter row. Lazily loads the chapter's
// first page as a thumbnail once the row scrolls near view (so a 280-chapter
// list doesn't fetch everything at once), with the chapter number laid over it.
// Falls back to just the number — or "–" when a chapter has none — while the
// thumb loads, if it fails, or for external "official release" chapters.
function ChapterThumb({ c }: { c: Chapter }) {
  const [src, setSrc] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (c.external) return; // external chapters have no readable pages to thumbnail
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting)) {
        io.disconnect();
        getChapterThumb(c.id).then((u) => { if (u) setSrc(u); }).catch(() => {});
      }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [c.id, c.external]);
  return (
    <span ref={ref} className="relative grid size-9 flex-none place-items-center overflow-hidden rounded-lg bg-cream-tint font-mono text-[12.5px] text-frost-text">
      {src && <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" className="absolute inset-0 size-full object-cover" />}
      {c.chapter ? (
        <span className={src ? "relative rounded bg-black/55 px-1 text-[10px] font-bold text-white" : "relative"}>{c.chapter}</span>
      ) : (
        !src && <span className="relative">–</span>
      )}
    </span>
  );
}

const cnc = (read: boolean) =>
  `group grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-2xl border-1.5 p-2 pr-3 transition hover:border-frost-hot ${read ? "border-frost-hot bg-cream-blush" : "border-line-soft bg-paper"}`;
