"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Columns2, Gauge, Loader2, Maximize, Rows3, ScrollText, Square } from "lucide-react";
import { getChapterPages, getChapters, getManga, safeDecode, type Chapter } from "@/lib/manga";
import { setReading } from "@/components/shell/presence";
import { cn } from "@/lib/utils";

type Mode = "strip" | "single" | "dual";

function usePref<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(fallback);
  useEffect(() => { try { const s = localStorage.getItem(key); if (s) setV(s as T); } catch { /* */ } }, [key]);
  return [v, useCallback((n: T) => { setV(n); try { localStorage.setItem(key, n); } catch { /* */ } }, [key])];
}

export function MangaReader({ mangaId, chapterId: rawChapterId }: { mangaId: string; chapterId: string }) {
  const router = useRouter();
  // The colon in the "wc:"/"cm:" source prefix arrives percent-encoded ("wc%3A…")
  // from the route, which breaks both the chapter lookup below and page loading.
  const chapterId = safeDecode(rawChapterId);
  const [pages, setPages] = useState<string[] | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [info, setInfo] = useState<{ title: string; cover: string | null }>({ title: "", cover: null });
  const [idx, setIdx] = useState(0);
  const [reloadN, setReloadN] = useState(0);
  const [mode, setMode] = usePref<Mode>("manga:mode", "strip");
  const [fitH, setFitH] = usePref<"0" | "1">("manga:fitH", "0");
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = usePref<string>("manga:speed", "2");
  const scroller = useRef<HTMLDivElement>(null);
  const resumeTo = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const cur = chapters.find((c) => c.id === chapterId);
  const pos = chapters.findIndex((c) => c.id === chapterId);
  const prev = pos > 0 ? chapters[pos - 1] : null;
  const next = pos >= 0 && pos < chapters.length - 1 ? chapters[pos + 1] : null;

  // Load everything for this chapter.
  useEffect(() => {
    setPages(null); setIdx(0);
    setAltPages(null); altReq.current = false;
    let on = true;
    let lang = "en";
    try { lang = localStorage.getItem("manga:lang") || "en"; } catch { /* storage off */ }
    getManga(mangaId).then((m) => { if (on && m) setInfo({ title: m.title, cover: m.cover }); }).catch(() => {});
    getChapters(mangaId, lang).then((c) => { if (on) setChapters(c); }).catch(() => {});
    getChapterPages(chapterId).then((p) => { if (on) setPages(p); }).catch(() => { if (on) setPages([]); });
    fetch(`/api/manga-progress?mangaId=${mangaId}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (on && d?.progress?.chapter_id === chapterId) resumeTo.current = d.progress.page;
    }).catch(() => {});
    return () => { on = false; };
  }, [mangaId, chapterId, reloadN]);

  // MangaDex's at-home nodes are rate-limited per IP and occasionally flaky, so a
  // page or two in a chapter can fail. On the first failure we fetch ONE fresh
  // at-home server; each failed image then retries from it on its own, so pages
  // that are loading fine are never disturbed.
  const [altPages, setAltPages] = useState<string[] | null>(null);
  const altReq = useRef(false);
  const requestAlt = useCallback(() => {
    if (altReq.current) return;
    altReq.current = true;
    getChapterPages(chapterId).then((p) => { if (p.length) setAltPages(p); }).catch(() => {});
  }, [chapterId]);

  // Save progress (debounced) whenever the page changes.
  const save = useCallback((page: number) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/manga-progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mangaId, chapterId, chapterNum: cur?.chapter ?? "", page, title: info.title, cover: info.cover }) }).catch(() => {});
    }, 1200);
  }, [mangaId, chapterId, cur, info]);
  useEffect(() => { if (pages?.length) save(idx); }, [idx, pages, save]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") navigator.sendBeacon?.("/api/manga-progress", new Blob([JSON.stringify({ mangaId, chapterId, chapterNum: cur?.chapter ?? "", page: idx, title: info.title, cover: info.cover })], { type: "application/json" })); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [mangaId, chapterId, cur, idx, info]);

  // Strip mode: which page is centred → idx (for progress + the counter).
  useEffect(() => {
    if (mode !== "strip" || !pages?.length) return;
    const root = scroller.current;
    const io = new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) { const n = Number((e.target as HTMLElement).dataset.n); if (Number.isFinite(n)) setIdx(n); }
    }, { root, threshold: 0.5 });
    root?.querySelectorAll("[data-n]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [mode, pages]);

  // apply the resume point once pages are in
  useEffect(() => {
    if (!pages?.length || resumeTo.current == null) return;
    const to = Math.min(resumeTo.current, pages.length - 1);
    resumeTo.current = null;
    if (mode === "strip") requestAnimationFrame(() => scroller.current?.querySelector(`[data-n="${to}"]`)?.scrollIntoView());
    else setIdx(to);
  }, [pages, mode]);

  // Tell presence we're reading this title, so it shows "reading X" in the
  // online list; clear it when the reader closes.
  useEffect(() => {
    if (info.title) setReading({ mangaId, title: info.title });
    return () => setReading(null);
  }, [mangaId, info.title]);

  // Prefetch the next chapter's first pages once you're near the end, so the
  // flip to the next chapter is instant.
  const prefetched = useRef<string | null>(null);
  useEffect(() => {
    if (!next || !pages?.length || idx < pages.length - 2) return;
    if (prefetched.current === next.id) return;
    prefetched.current = next.id;
    getChapterPages(next.id).then((ps) => {
      ps.slice(0, 3).forEach((src) => { const im = new Image(); im.src = src; });
    }).catch(() => {});
  }, [idx, pages, next]);

  // auto-scroll (strip)
  useEffect(() => {
    if (!auto || mode !== "strip") return;
    let raf = 0;
    const step = () => { if (scroller.current) scroller.current.scrollTop += Number(speed); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [auto, mode, speed]);

  const go = useCallback((d: 1 | -1) => {
    if (!pages) return;
    const stepN = mode === "dual" ? 2 : 1;
    const nx = idx + d * stepN;
    if (nx < 0) { if (prev) router.push(`/manga/${mangaId}/${prev.id}`); return; }
    if (nx >= pages.length) { if (next) router.push(`/manga/${mangaId}/${next.id}`); return; }
    setIdx(nx);
    scroller.current?.scrollTo({ top: 0 });
  }, [idx, pages, mode, prev, next, mangaId, router]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea")) return;
      if (mode !== "strip") {
        if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      }
      if (e.key.toLowerCase() === "a") setAuto((a) => !a);
      if (e.key.toLowerCase() === "f") document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, mode]);

  const total = pages?.length ?? 0;
  const fit = fitH === "1";
  const btn = "grid size-9 place-items-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0a0d]">
      {/* top bar */}
      <div className="flex flex-none items-center gap-2 border-b border-white/10 bg-black/40 px-3 py-2 backdrop-blur-xl">
        <Link href={`/manga/${mangaId}`} className={btn} aria-label="Back"><ChevronLeft className="size-5" /></Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-extrabold text-white">{info.title || "Reading"}</div>
          <div className="truncate text-[11px] font-semibold text-white/55">Ch. {cur?.chapter || "?"}{cur?.title ? ` · ${cur.title}` : ""} · {total ? `${Math.min(idx + 1, total)}/${total}` : "…"}</div>
        </div>
        <button type="button" onClick={() => setMode(mode === "strip" ? "single" : mode === "single" ? "dual" : "strip")} className={btn} aria-label="Layout" title={mode}>
          {mode === "strip" ? <ScrollText className="size-5" /> : mode === "single" ? <Square className="size-5" /> : <Columns2 className="size-5" />}
        </button>
        <button type="button" onClick={() => setFitH(fit ? "0" : "1")} className={cn(btn, fit && "text-frost")} aria-label="Fit" title={fit ? "Fit height" : "Fit width"}><Rows3 className="size-5" /></button>
        {mode === "strip" && (
          <button type="button" onClick={() => setAuto((a) => !a)} className={cn(btn, auto && "text-frost")} aria-label="Auto-scroll" title="Auto-scroll (A)"><Gauge className="size-5" /></button>
        )}
        {mode === "strip" && auto && (
          <input type="range" min={1} max={10} value={speed} onChange={(e) => setSpeed(e.target.value)} className="w-20 accent-[var(--frost)]" aria-label="Scroll speed" />
        )}
        <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} className={cn(btn, "hidden sm:grid")} aria-label="Fullscreen"><Maximize className="size-5" /></button>
      </div>

      {/* pages */}
      <div ref={scroller} className="relative flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        {pages === null ? (
          <div className="grid h-full place-items-center"><Loader2 className="size-10 animate-spin text-frost" /></div>
        ) : pages.length === 0 ? (
          <div className="grid h-full place-items-center p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="text-[15px] font-bold text-white/80">this chapter didn’t load.</p>
              <p className="max-w-[320px] text-[12.5px] font-medium text-white/50">the source can be slow to wake up. give it a second and try again.</p>
              <button type="button" onClick={() => { setPages(null); setReloadN((n) => n + 1); }} className="rounded-full bg-frost px-6 py-2.5 text-[13.5px] font-extrabold text-frost-ink">try again</button>
            </div>
          </div>
        ) : mode === "strip" ? (
          <div className="mx-auto flex max-w-[920px] flex-col items-center">
            {pages.map((src, n) => (
              <Page key={n} n={n} dataN={n} src={src} altSrc={altPages?.[n]} onReqAlt={requestAlt} eager={n < 2} className={cn("w-full select-none", fit && "h-[calc(100svh-52px)] w-auto object-contain")} />
            ))}
            <div className="flex w-full flex-col items-center gap-3 py-10 text-center">
              {next ? (
                <Link href={`/manga/${mangaId}/${next.id}`} className="rounded-full bg-frost px-6 py-3 text-[14px] font-extrabold text-frost-ink">Next chapter · {next.chapter} →</Link>
              ) : (
                <span className="text-[14px] font-bold text-white/70">You’re all caught up.</span>
              )}
            </div>
          </div>
        ) : (
          // paged
          <div className="relative grid h-full place-items-center">
            <div className={cn("flex h-full items-center justify-center", mode === "dual" && "gap-1")}>
              {[idx, ...(mode === "dual" && idx + 1 < pages.length ? [idx + 1] : [])].map((n) => (
                <Page key={n} n={n} src={pages[n]} altSrc={altPages?.[n]} onReqAlt={requestAlt} className={cn("select-none", fit ? "max-h-[calc(100svh-52px)] w-auto" : "max-w-full", mode === "dual" && "max-h-[calc(100svh-52px)]")} />
              ))}
            </div>
            {/* tap zones */}
            <button type="button" aria-label="Previous page" onClick={() => go(-1)} className="absolute inset-y-0 left-0 w-1/3" />
            <button type="button" aria-label="Next page" onClick={() => go(1)} className="absolute inset-y-0 right-0 w-2/3" />
          </div>
        )}
      </div>

      {/* paged footer nav */}
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

// One manga page image. Loads direct from the MangaDex CDN with no referrer
// (like the covers, which work). If it fails, it retries once from a fresh
// at-home server (requested via onReqAlt) — on its own, so pages that loaded
// fine are untouched.
function Page({ n, dataN, src, altSrc, onReqAlt, eager, className }: {
  n: number; dataN?: number; src: string; altSrc?: string; onReqAlt: () => void; eager?: boolean; className?: string;
}) {
  const [url, setUrl] = useState(src);
  const failed = useRef(false);
  useEffect(() => { setUrl(src); failed.current = false; }, [src]);
  useEffect(() => { if (failed.current && altSrc && url !== altSrc) setUrl(altSrc); }, [altSrc, url]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      data-n={dataN}
      alt={`Page ${n + 1}`}
      loading={eager ? "eager" : "lazy"}
      referrerPolicy="no-referrer"
      onError={() => { if (!failed.current) { failed.current = true; onReqAlt(); if (altSrc) setUrl(altSrc); } }}
      className={className}
    />
  );
}
