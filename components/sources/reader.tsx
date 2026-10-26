"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Columns2, Loader2, Maximize, Rows3, ScrollText, Square } from "lucide-react";
import { sourceDetail, sourcePages, type SourceId, type SrcChapter } from "@/lib/manga-sources";
import { cn } from "@/lib/utils";

// Reading layout. "strip" is the long vertical scroll (the default); "single"
// and "dual" are paged — click/tap or arrow keys turn one (or two) pages at a
// time, the way a doujin usually reads. Stored per-viewer so the choice sticks.
type Mode = "strip" | "single" | "dual";
function usePref<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(fallback);
  useEffect(() => { try { const s = localStorage.getItem(key); if (s) setV(s as T); } catch { /* storage off */ } }, [key]);
  return [v, useCallback((n: T) => { setV(n); try { localStorage.setItem(key, n); } catch { /* */ } }, [key])];
}

export function SourceReader({ source, slug, chapter }: { source: SourceId; slug: string; chapter: string }) {
  const router = useRouter();
  const [pages, setPages] = useState<string[] | null>(null);
  const [chapters, setChapters] = useState<SrcChapter[]>([]);
  const [title, setTitle] = useState("");
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = usePref<Mode>("src:mode", "strip");
  const [fitH, setFitH] = usePref<"0" | "1">("src:fitH", "0");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPages(null); setIdx(0);
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
  const total = pages?.length ?? 0;
  const fit = fitH === "1";

  // Paged navigation: step through pages, rolling onto the prev/next chapter at
  // the ends (a doujin is a single chapter, so those are simply no-ops there).
  const go = useCallback((d: 1 | -1) => {
    if (!pages) return;
    const step = mode === "dual" ? 2 : 1;
    const nx = idx + d * step;
    if (nx < 0) { if (prev) router.push(href(prev)); return; }
    if (nx >= pages.length) { if (next) router.push(href(next)); return; }
    setIdx(nx);
    scroller.current?.scrollTo({ top: 0 });
  }, [pages, mode, idx, prev, next]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preload the next page image in paged mode so a click flips instantly.
  useEffect(() => {
    if (mode === "strip" || !pages?.length) return;
    const n = idx + (mode === "dual" ? 2 : 1);
    if (n < pages.length) { const im = new Image(); im.src = pages[n]; }
  }, [idx, mode, pages]);

  // Arrow keys turn pages when paged.
  useEffect(() => {
    if (mode === "strip") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea")) return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, mode]);

  const btn = "grid size-9 place-items-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0a0d]">
      <div className="flex flex-none items-center gap-2 border-b border-white/10 bg-black/40 px-3 py-2 backdrop-blur-xl">
        <Link href={`/read/${source}/${encodeURIComponent(slug)}`} className={btn} aria-label="Back"><ChevronLeft className="size-5" /></Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-extrabold text-white">{title || "Reading"}</div>
          <div className="truncate text-[11px] font-semibold text-white/55">Ch. {cur?.number || "?"}{cur?.title ? ` · ${cur.title}` : ""}{total ? ` · ${Math.min(idx + 1, total)}/${total}` : ""}</div>
        </div>
        <button type="button" onClick={() => setMode(mode === "strip" ? "single" : mode === "single" ? "dual" : "strip")} className={btn} aria-label="Layout" title={mode === "strip" ? "scroll" : mode === "single" ? "one page" : "two pages"}>
          {mode === "strip" ? <ScrollText className="size-5" /> : mode === "single" ? <Square className="size-5" /> : <Columns2 className="size-5" />}
        </button>
        <button type="button" onClick={() => setFitH(fit ? "0" : "1")} className={cn(btn, fit && "text-frost")} aria-label="Fit" title={fit ? "Fit height" : "Fit width"}><Rows3 className="size-5" /></button>
        <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} className={cn(btn, "hidden sm:grid")} aria-label="Fullscreen"><Maximize className="size-5" /></button>
      </div>

      <div ref={scroller} className="relative flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        {pages === null ? (
          <div className="grid h-full place-items-center"><Loader2 className="size-10 animate-spin text-frost" /></div>
        ) : pages.length === 0 ? (
          <div className="grid h-full place-items-center p-8 text-center text-[15px] font-bold text-white/80">This chapter has no readable pages here.</div>
        ) : mode === "strip" ? (
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
        ) : (
          <div className="relative grid h-full place-items-center">
            <div className={cn("flex h-full items-center justify-center", mode === "dual" && "gap-1")}>
              {[idx, ...(mode === "dual" && idx + 1 < pages.length ? [idx + 1] : [])].map((n) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={n} src={pages[n]} alt={`Page ${n + 1}`} referrerPolicy="no-referrer"
                  className={cn("select-none", fit ? "max-h-[calc(100svh-52px)] w-auto" : "max-w-full", mode === "dual" && "max-h-[calc(100svh-52px)]")} />
              ))}
            </div>
            {/* click/tap zones: left third = previous, right two thirds = next */}
            <button type="button" aria-label="Previous page" onClick={() => go(-1)} className="absolute inset-y-0 left-0 w-1/3" />
            <button type="button" aria-label="Next page" onClick={() => go(1)} className="absolute inset-y-0 right-0 w-2/3" />
          </div>
        )}
      </div>

      {pages && pages.length > 0 && mode !== "strip" && (
        <div className="flex flex-none items-center justify-between gap-3 border-t border-white/10 bg-black/40 px-4 py-2 text-white backdrop-blur-xl">
          <button type="button" onClick={() => go(-1)} className="flex items-center gap-1 text-[13px] font-bold text-white/80 hover:text-white"><ChevronLeft className="size-4" />{idx === 0 && prev ? "Prev ch." : "Prev"}</button>
          <span className="font-mono text-[12.5px] text-white/70">{Math.min(idx + 1, total)} / {total}</span>
          <button type="button" onClick={() => go(1)} className="flex items-center gap-1 text-[13px] font-bold text-white/80 hover:text-white">{idx + 1 >= total && next ? "Next ch." : "Next"}<ChevronRight className="size-4" /></button>
        </div>
      )}
    </div>
  );
}
