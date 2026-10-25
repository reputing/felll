"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { sourceDetail, sourcePages, type SourceId, type SrcChapter } from "@/lib/manga-sources";

export function SourceReader({ source, slug, chapter }: { source: SourceId; slug: string; chapter: string }) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [chapters, setChapters] = useState<SrcChapter[]>([]);
  const [title, setTitle] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPages(null);
    let on = true;
    sourceDetail(source, slug).then((d) => { if (on && d) { setChapters(d.chapters); setTitle(d.title); } }).catch(() => {});
    sourcePages(source, slug, chapter).then((p) => { if (on) setPages(p); }).catch(() => { if (on) setPages([]); });
    scroller.current?.scrollTo({ top: 0 });
    return () => { on = false; };
  }, [source, slug, chapter]);

  const pos = chapters.findIndex((c) => c.slug === chapter);
  const cur = pos >= 0 ? chapters[pos] : null;
  const prev = pos > 0 ? chapters[pos - 1] : null;
  const next = pos >= 0 && pos < chapters.length - 1 ? chapters[pos + 1] : null;
  const href = (c: SrcChapter) => `/read/${source}/${encodeURIComponent(slug)}/${encodeURIComponent(c.slug)}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0a0d]">
      <div className="flex flex-none items-center gap-2 border-b border-white/10 bg-black/40 px-3 py-2 backdrop-blur-xl">
        <Link href={`/read/${source}/${encodeURIComponent(slug)}`} className="grid size-9 place-items-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white" aria-label="Back"><ChevronLeft className="size-5" /></Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-extrabold text-white">{title || "Reading"}</div>
          <div className="truncate text-[11px] font-semibold text-white/55">Ch. {cur?.number || "?"}{cur?.title ? ` · ${cur.title}` : ""}</div>
        </div>
      </div>

      <div ref={scroller} className="relative flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        {pages === null ? (
          <div className="grid h-full place-items-center"><Loader2 className="size-10 animate-spin text-frost" /></div>
        ) : pages.length === 0 ? (
          <div className="grid h-full place-items-center p-8 text-center text-[15px] font-bold text-white/80">This chapter has no readable pages here.</div>
        ) : (
          <div className="mx-auto flex max-w-[920px] flex-col items-center">
            {pages.map((src, n) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={n} src={src} alt={`Page ${n + 1}`} loading={n < 2 ? "eager" : "lazy"} referrerPolicy="no-referrer" className="w-full select-none" />
            ))}
            <div className="flex w-full flex-col items-center gap-3 py-10 text-center">
              {next ? (
                <Link href={href(next)} className="rounded-full bg-frost px-6 py-3 text-[14px] font-extrabold text-frost-ink">Next chapter · {next.number} →</Link>
              ) : (
                <span className="text-[14px] font-bold text-white/70">You’re all caught up.</span>
              )}
              {prev && <Link href={href(prev)} className="text-[13px] font-bold text-white/60 hover:text-white">← Previous chapter</Link>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
