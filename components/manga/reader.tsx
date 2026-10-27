"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Columns2, Gauge, Loader2, Maximize, Rows3, ScrollText, Square } from "lucide-react";
import { cachedChapters, getChapterPages, getChapters, getManga, safeDecode, type Chapter } from "@/lib/manga";
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
  // Pornographic titles: (1) their MangaDex at-home pages 404 the browser (they
  // load through our origin instead, see Page), and (2) reading them must stay
  // private — no "reading X" in the online list, no progress on the public
  // profile — same as the doujin reader, which broadcasts nothing.
  const [adult, setAdult] = useState(false);
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
    getManga(mangaId).then((m) => { if (on && m) { setInfo({ title: m.title, cover: m.cover }); setAdult(m.rating === "pornographic"); } }).catch(() => {});
    const cachedChs = cachedChapters(mangaId, lang);
    if (cachedChs) setChapters(cachedChs); // instant prev/next + chapter number
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

  // Latest chapter/title metadata, read by the (stable) progress savers below so
  // they don't need `cur`/`info` as deps. Those change reference as the chapter
  // list and title resolve after mount, which was re-firing the save effect and
  // churning the /api/manga-progress POST on load.
  const meta = useRef({ chapterNum: "", title: "", cover: null as string | null });
  meta.current = { chapterNum: cur?.chapter ?? "", title: info.title, cover: info.cover };
  const lastSaved = useRef<number | null>(null);
  useEffect(() => { lastSaved.current = null; }, [chapterId]); // new chapter → allow a fresh save

  // Save progress (debounced) whenever the page changes. Skip a repeat save for
  // the same page so effect re-runs don't emit duplicate requests.
  const save = useCallback((page: number) => {
    if (lastSaved.current === page) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      lastSaved.current = page;
      const m = meta.current;
      fetch("/api/manga-progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mangaId, chapterId, chapterNum: m.chapterNum, page, title: m.title, cover: m.cover }) }).catch(() => {});
    }, 1200);
  }, [mangaId, chapterId]);
  // Adult titles save no progress — it would surface on the public profile.
  useEffect(() => { if (pages?.length && !adult) save(idx); }, [idx, pages, save, adult]);
  useEffect(() => {
    if (adult) return;
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      const m = meta.current;
      navigator.sendBeacon?.("/api/manga-progress", new Blob([JSON.stringify({ mangaId, chapterId, chapterNum: m.chapterNum, page: idx, title: m.title, cover: m.cover })], { type: "application/json" }));
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [mangaId, chapterId, idx, adult]);

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
    if (info.title && !adult) setReading({ mangaId, title: info.title });
    return () => setReading(null);
  }, [mangaId, info.title, adult]);

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
              <Page key={n} n={n} dataN={n} src={src} altSrc={altPages?.[n]} onReqAlt={requestAlt} eager={n < 2} proxy={adult} mdCh={adult ? chapterId : undefined} className={cn("w-full select-none", fit && "h-[calc(100svh-52px)] w-auto object-contain")} />
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
                <Page key={n} n={n} src={pages[n]} altSrc={altPages?.[n]} onReqAlt={requestAlt} proxy={adult} mdCh={adult ? chapterId : undefined} className={cn("select-none", fit ? "max-h-[calc(100svh-52px)] w-auto" : "max-w-full", mode === "dual" && "max-h-[calc(100svh-52px)]")} />
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

// One manga page image. It can be delivered two ways: direct from the MangaDex
// CDN (fast, the default), or through our own origin (/api/manga-img fetches it
// server-side and streams the bytes). Adult titles stay on MangaDex, and those
// at-home nodes 404 the user's browser even though the exact URL is fetchable
// server-side — so for them we go through the proxy FIRST (`proxy`). onError
// falls through to the other delivery path, then a cache-bust, then a fresh
// at-home server, so a page that loads fine is never disturbed.
function Page({ n, dataN, src, altSrc, onReqAlt, eager, proxy, mdCh, className }: {
  n: number; dataN?: number; src: string; altSrc?: string; onReqAlt: () => void; eager?: boolean; proxy?: boolean; mdCh?: string; className?: string;
}) {
  const viaProxy = (u: string) => (/^https?:\/\//.test(u) ? `/api/manga-img?u=${encodeURIComponent(u)}` : u);
  // Adult MangaDex pages go through /api/md-page, which resolves a FRESH at-home
  // server per request, so they never 404 from the ~15-min at-home token expiry
  // on a long chapter. The direct CDN url stays as the fallback.
  const mdSrc = mdCh ? `/api/md-page?ch=${encodeURIComponent(mdCh)}&p=${n}` : null;
  const primary = mdSrc ?? (proxy ? viaProxy(src) : src);
  const secondary = mdSrc ? src : proxy ? src : viaProxy(src);
  const [url, setUrl] = useState(primary);
  const tries = useRef(0);
  useEffect(() => { setUrl(primary); tries.current = 0; }, [primary]);
  const onError = () => {
    tries.current += 1;
    if (tries.current === 1) { onReqAlt(); setUrl(secondary); }
    else if (tries.current === 2) { setUrl(`${primary}${primary.includes("?") ? "&" : "?"}cb=${Date.now()}`); }
    else if (tries.current === 3 && altSrc && altSrc !== src) { setUrl(proxy ? viaProxy(altSrc) : altSrc); }
  };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      data-n={dataN}
      alt={`Page ${n + 1}`}
      loading={eager ? "eager" : "lazy"}
      referrerPolicy="no-referrer"
      onError={onError}
      className={className}
    />
  );
}
