"use client";
import type Hls from "hls.js";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  Captions, Check, ChevronRight, FastForward, Loader2, Maximize, Minimize, Pause, PictureInPicture2, Play,
  RectangleHorizontal, Settings, SkipBack, SkipForward, Volume1, Volume2, VolumeX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { POPUP, POPUP_ITEM, POPUP_LABEL, POPUP_SEPARATOR } from "@/components/ui/popup";
import { setMini, useBox } from "@/lib/store";
import { clock, cn } from "@/lib/utils";

export interface Source { id: string | number; label: string; audio: "sub" | "dub" | "raw" }
export interface Track { id: string | number; language: string; label: string; url: string; is_default: number }
export interface Meta { malId: number; ep: number; title: string; image: string | null; episodes: number | null; format: string }

interface Props {
  sources: Source[];
  subtitles: Track[];
  intro: { start: number | null; end: number | null };
  outroStart: number | null;
  nextHref: string | null;
  prevHref: string | null;
  startAt: number;
  meta: Meta;
  poster: string | null;
}

function usePref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [val, setVal] = useState(fallback);
  useEffect(() => {
    try { const v = localStorage.getItem(key); if (v != null) setVal(v === "1"); } catch {}
  }, [key]);
  return [val, useCallback((v: boolean) => { setVal(v); try { localStorage.setItem(key, v ? "1" : "0"); } catch {} }, [key])];
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const AUDIO = { sub: "Sub", dub: "Dub", raw: "Raw" };

export function Player({ sources, subtitles, intro, outroStart, nextHref, prevHref, startAt, meta, poster }: Props) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hls = useRef<Hls | null>(null);
  const dub = useBox((s) => s.dub);
  const [current, setCurrent] = useState<Source | undefined>(() => sources.find((s) => s.audio === (dub ? "dub" : "sub")) ?? sources[0]);
  const [failed, setFailed] = useState<Set<string | number>>(new Set());
  // Servers a background probe found unplayable — hidden from the picker.
  const [dead, setDead] = useState<Set<string | number>>(new Set());
  // Some providers return skip markers with the stream; they win over the props.
  const [streamIntro, setStreamIntro] = useState<{ start: number; end: number } | null>(null);
  const [streamOutro, setStreamOutro] = useState<{ start: number; end: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extraSubs, setExtraSubs] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [caption, setCaption] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [idle, setIdle] = useState(false);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [nextIn, setNextIn] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [autoNext, setAutoNext] = usePref("autoNext", true);
  const [autoSkip, setAutoSkip] = usePref("autoSkip", false);
  const [theater, setTheater] = usePref("theater", false);
  const started = useRef(false);
  const lastSent = useRef(0);
  const ended = useRef(false);

  // Effective skip markers: a provider's own markers (Anivexa) override the
  // vault's stored ones for the current source.
  const introStart = streamIntro?.start ?? intro.start;
  const introEnd = streamIntro?.end ?? intro.end;
  const outroStartEff = streamOutro?.start ?? outroStart;

  useEffect(() => {
    if (theater) document.documentElement.dataset.theater = "1";
    else delete document.documentElement.dataset.theater;
    return () => { delete document.documentElement.dataset.theater; };
  }, [theater]);

  // dub/sub switch in the header picks the matching server
  useEffect(() => {
    const want = sources.find((s) => s.audio === (dub ? "dub" : "sub") && !failed.has(s.id));
    if (want && want.audio !== current?.audio) setCurrent(want);
  }, [dub]); // eslint-disable-line react-hooks/exhaustive-deps

  const fallback = useCallback((src: Source) => {
    setFailed((prev) => {
      const next = new Set(prev).add(src.id);
      const cand = sources.find((s) => !next.has(s.id) && s.audio === src.audio) ?? sources.find((s) => !next.has(s.id));
      if (cand) setCurrent(cand);
      else setError("This episode won’t play right now. Try again in a little while.");
      return next;
    });
  }, [sources]);

  // load the chosen source; hls.js only downloads when the browser can't play HLS itself
  useEffect(() => {
    const v = video.current;
    if (!v || !current) return;
    let cancelled = false;
    const resumeAt = v.currentTime > 1 ? v.currentTime : startAt;
    setError(null);
    setLoading(true);
    (async () => {
      const res = await fetch(`/api/play/${current.id}`);
      if (!res.ok) return fallback(current);
      const data = (await res.json()) as { url: string; subtitles?: Track[]; intro?: { start: number; end: number } | null; outro?: { start: number; end: number } | null };
      const url = data.url;
      if (cancelled) return;
      setExtraSubs(data.subtitles ?? []);
      setStreamIntro(data.intro ?? null);
      setStreamOutro(data.outro ?? null);
      hls.current?.destroy();
      hls.current = null;
      if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = url;
      } else {
        const { default: HlsJs } = await import("hls.js");
        if (cancelled) return;
        if (!HlsJs.isSupported()) { setError("This browser can’t play the stream."); return; }
        const h = new HlsJs({ capLevelToPlayerSize: true, startPosition: resumeAt > 5 ? resumeAt : -1 });
        hls.current = h;
        h.on(HlsJs.Events.ERROR, (_e, data) => { if (data.fatal) { h.destroy(); fallback(current); } });
        h.loadSource(url);
        h.attachMedia(v);
      }
      const seek = () => { if (resumeAt > 5 && Math.abs(v.currentTime - resumeAt) > 2) v.currentTime = resumeAt; };
      v.addEventListener("loadedmetadata", seek, { once: true });
      v.play().catch(() => {});
    })().catch(() => fallback(current));
    return () => { cancelled = true; };
  }, [current, fallback, startAt]);

  useEffect(() => () => hls.current?.destroy(), []);

  // Hide servers that won't play. Local vault rows are known-ready; only the
  // external (Anivexa) servers need checking, and the resolve is cached upstream
  // so this stays cheap. Runs in the background, a few at a time, after load.
  useEffect(() => {
    const probe = sources.filter((s) => typeof s.id === "string" && s.id.startsWith("anivexa:"));
    if (!probe.length) return;
    const ac = new AbortController();
    let i = 0;
    const worker = async () => {
      while (i < probe.length && !ac.signal.aborted) {
        const s = probe[i++];
        if (s.id === current?.id) continue; // the playing server proves itself
        try {
          const res = await fetch(`/api/play/${s.id}`, { signal: ac.signal });
          if (!res.ok) setDead((d) => new Set(d).add(s.id));
        } catch { /* aborted or a transient error — leave it listed */ }
      }
    };
    Promise.allSettled(Array.from({ length: 3 }, worker));
    return () => ac.abort();
  }, [sources]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the store's "now playing" in sync so the mini-player can take over when
  // the watch page unmounts. On unmount we hand off the live position; if the
  // episode had ended, we clear it instead.
  useEffect(() => {
    setMini({
      sourceId: current?.id ?? sources[0].id, malId: meta.malId, ep: meta.ep, title: meta.title,
      image: meta.image, episodes: meta.episodes, format: meta.format,
      href: `/watch/${meta.malId}/${meta.ep}`, position: startAt, paused: true,
    });
    return () => {
      const v = video.current;
      if (ended.current) setMini(null);
      else if (v) setMini({ position: v.currentTime || startAt, paused: v.paused });
    };
  }, [meta.malId, meta.ep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (current) setMini({ sourceId: current.id }); }, [current]);

  const report = useCallback((force = false) => {
    const v = video.current;
    if (!v || !v.duration) return;
    const now = Date.now();
    if (!force && now - lastSent.current < 15_000) return;
    lastSent.current = now;
    const start = !started.current;
    started.current = true;
    fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ ...meta, position: v.currentTime, duration: v.duration, start }),
    })
      .then((r) => r.json())
      .then((j) => { if (j.finished) router.refresh(); })
      .catch(() => {});
  }, [meta, router]);

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && report(true);
    document.addEventListener("visibilitychange", onHide);
    return () => { report(true); document.removeEventListener("visibilitychange", onHide); };
  }, [report]);

  // auto-next countdown
  useEffect(() => {
    if (nextIn === null) return;
    if (nextIn <= 0) { if (nextHref) router.push(nextHref); return; }
    const id = setTimeout(() => setNextIn((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(id);
  }, [nextIn, nextHref, router]);

  // controls fade while playing and the pointer is still
  const poke = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(poke.current);
    poke.current = setTimeout(() => setIdle(true), 2600);
  }, []);

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }, []);
  const seekBy = useCallback((s: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + s));
    setFlash(s > 0 ? `+${s}s` : `${s}s`);
  }, []);
  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else box.current?.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(id);
  }, [flash]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = video.current;
      const el = e.target as HTMLElement;
      if (!v || el.closest("input, textarea, [contenteditable], [role=menu]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const act: Record<string, () => void> = {
        " ": toggle, k: toggle, f: fullscreen,
        m: () => { v.muted = !v.muted; },
        arrowleft: () => seekBy(-5), arrowright: () => seekBy(5), j: () => seekBy(-10), l: () => seekBy(10),
        arrowup: () => { v.volume = Math.min(1, v.volume + 0.1); setFlash(`${Math.round(v.volume * 100)}%`); },
        arrowdown: () => { v.volume = Math.max(0, v.volume - 0.1); setFlash(`${Math.round(v.volume * 100)}%`); },
        t: () => setTheater(!theater),
        c: () => setCaption((c) => (c ? null : (extraSubs.length ? extraSubs : subtitles)[0]?.language ?? null)),
        s: () => { if (introEnd != null) v.currentTime = introEnd; },
        n: () => { if (nextHref) router.push(nextHref); },
        p: () => { if (prevHref) router.push(prevHref); },
        ",": () => { if (v.paused) v.currentTime -= 1 / 24; },
        ".": () => { if (v.paused) v.currentTime += 1 / 24; },
      };
      if (/^[0-9]$/.test(k) && v.duration) { e.preventDefault(); v.currentTime = (Number(k) / 10) * v.duration; return; }
      if (act[k]) { e.preventDefault(); act[k](); wake(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, fullscreen, seekBy, theater, setTheater, subtitles, extraSubs, introEnd, nextHref, prevHref, router, wake]);

  // captions: show the chosen track only
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    for (const tr of Array.from(v.textTracks)) tr.mode = tr.language === caption ? "showing" : "disabled";
  }, [caption, current]);

  const onTime = () => {
    const v = video.current!;
    setT(v.currentTime);
    if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    report();
    if (autoSkip && introStart != null && introEnd != null && v.currentTime >= introStart && v.currentTime < introEnd - 0.5) {
      v.currentTime = introEnd;
      setFlash("Skipped intro");
    }
    if (autoNext && nextHref && outroStartEff != null && v.currentTime >= outroStartEff && nextIn === null) setNextIn(8);
  };

  if (!sources.length) return null;

  // Local episodes carry their subtitles as a prop; Anivexa streams return them
  // with the stream (extraSubs). Only one applies to a given source.
  const subs = extraSubs.length ? extraSubs : subtitles;

  const inIntro = introStart != null && introEnd != null && t >= introStart && t < introEnd;
  const inOutro = outroStartEff != null && nextHref != null && t >= outroStartEff;
  const VolIcon = muted || vol === 0 ? VolumeX : vol < 0.5 ? Volume1 : Volume2;
  const pct = dur ? (t / dur) * 100 : 0;
  const hidden = playing && idle && !hover;

  const bar = "grid size-10 place-items-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white";

  return (
    <div ref={box} onMouseMove={wake} onMouseLeave={() => playing && setIdle(true)}
      className={cn("group/player relative aspect-video w-full overflow-hidden rounded-[26px] border-1.5 border-night-line bg-black shadow-[0_30px_60px_-30px_rgba(0,0,0,.9)] select-none", full && "rounded-none border-0", hidden && "cursor-none")}>
      <video
        ref={video}
        playsInline
        poster={poster ?? undefined}
        className="size-full"
        onClick={toggle}
        onDoubleClick={fullscreen}
        onPlay={() => { setPlaying(true); ended.current = false; setMini({ paused: false }); wake(); }}
        onPause={() => { setPlaying(false); setIdle(false); report(true); setMini({ paused: true }); }}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onCanPlay={() => setLoading(false)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onDurationChange={(e) => setDur(e.currentTarget.duration)}
        onTimeUpdate={onTime}
        onVolumeChange={(e) => { setVol(e.currentTarget.volume); setMuted(e.currentTarget.muted); }}
        onRateChange={(e) => setSpeed(e.currentTarget.playbackRate)}
        onEnded={() => { ended.current = true; report(true); setMini(null); if (autoNext && nextHref) setNextIn((n) => n ?? 5); }}
        crossOrigin="anonymous"
      >
        {subs.map((s) => <track key={s.id} kind="subtitles" src={s.url} srcLang={s.language} label={s.label} />)}
      </video>

      {/* centre states */}
      {loading && !error && <div className="pointer-events-none absolute inset-0 grid place-items-center"><Loader2 className="size-12 animate-spin text-frost" /></div>}
      {!playing && !loading && !error && nextIn === null && (
        <button type="button" onClick={toggle} aria-label="Play" className="absolute left-1/2 top-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-frost text-frost-ink shadow-[0_0_0_10px_rgb(var(--glow)/.25)] transition hover:scale-105">
          <Play className="ml-1 size-8" fill="currentColor" />
        </button>
      )}
      {flash && <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-5 py-2.5 text-[15px] font-extrabold text-white backdrop-blur animate-in fade-in zoom-in-90">{flash}</div>}
      {error && <div className="absolute inset-0 grid place-items-center bg-black/85 p-6 text-center text-[15px] font-bold text-white">{error}</div>}

      {/* skip buttons */}
      {inIntro && !autoSkip && (
        <button type="button" onClick={() => { video.current!.currentTime = introEnd!; }} className="absolute bottom-24 right-5 flex h-11 items-center gap-2 rounded-full border-1.5 border-white/30 bg-black/60 px-5 text-[14px] font-extrabold text-white backdrop-blur-md transition hover:bg-frost hover:text-frost-ink animate-in fade-in slide-in-from-right-4">
          <FastForward className="size-4" /> Skip intro
        </button>
      )}
      {inOutro && nextIn === null && (
        <button type="button" onClick={() => router.push(nextHref!)} className="absolute bottom-24 right-5 flex h-11 items-center gap-2 rounded-full bg-frost px-5 text-[14px] font-extrabold text-frost-ink shadow-press animate-in fade-in slide-in-from-right-4">
          Next episode <ChevronRight className="size-4" />
        </button>
      )}

      {/* up next */}
      {nextIn !== null && nextHref && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="flex flex-col items-center gap-2 text-center text-white sm:gap-4">
            <div className="text-[11px] font-bold uppercase tracking-[.16em] text-frost sm:text-[12px]">Up next · Episode {meta.ep + 1}</div>
            <div className="relative grid size-16 place-items-center sm:size-24">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="6" /><circle cx="50" cy="50" r="45" fill="none" stroke="var(--frost)" strokeWidth="6" strokeLinecap="round" strokeDasharray="283" strokeDashoffset={283 - (283 * (8 - nextIn)) / 8} className="transition-[stroke-dashoffset] duration-1000 ease-linear" /></svg>
              <span className="font-mono text-[22px] sm:text-[30px]">{nextIn}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setNextIn(null)} className="h-10 rounded-full border-1.5 border-white/30 px-5 text-[13.5px] font-bold hover:bg-white/10">Cancel</button>
              <button type="button" onClick={() => router.push(nextHref)} className="h-10 rounded-full bg-frost px-5 text-[13.5px] font-extrabold text-frost-ink">Play now</button>
            </div>
          </div>
        </div>
      )}

      {/* controls */}
      <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-1.5 pt-14 transition-opacity duration-300 sm:px-4 sm:pb-3", (hidden || nextIn !== null) && "pointer-events-none opacity-0")}>
        <div
          className="group/seek relative mb-2 h-5 cursor-pointer"
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); setHover({ x: x * 100, t: x * dur }); }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (video.current && dur) video.current.currentTime = ((e.clientX - r.left) / r.width) * dur; }}
          role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)} tabIndex={-1}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/20 transition-all group-hover/seek:h-1.5">
            <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${dur ? (buffered / dur) * 100 : 0}%` }} />
            {introStart != null && introEnd != null && dur > 0 && <div className="absolute inset-y-0 bg-sprinkle-butter/70" style={{ left: `${(introStart / dur) * 100}%`, width: `${((introEnd - introStart) / dur) * 100}%` }} />}
            <div className="absolute inset-y-0 left-0 bg-frost" style={{ width: `${pct}%` }} />
          </div>
          <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-frost shadow-[0_0_0_4px_rgb(var(--glow)/.35)] opacity-0 transition group-hover/seek:opacity-100" style={{ left: `${pct}%` }} />
          {hover && dur > 0 && <div className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-lg bg-black/80 px-2 py-1 font-mono text-[11.5px] text-white" style={{ left: `${hover.x}%` }}>{clock(hover.t)}</div>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={bar} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5" fill="currentColor" />}</button>
          {prevHref && <button type="button" className={bar} onClick={() => router.push(prevHref)} aria-label="Previous episode"><SkipBack className="size-[18px]" /></button>}
          {nextHref && <button type="button" className={bar} onClick={() => router.push(nextHref)} aria-label="Next episode"><SkipForward className="size-[18px]" /></button>}
          <div className="group/vol flex items-center">
            <button type="button" className={bar} onClick={() => { if (video.current) video.current.muted = !video.current.muted; }} aria-label={muted ? "Unmute" : "Mute"}><VolIcon className="size-5" /></button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} aria-label="Volume"
              onChange={(e) => { const v = video.current!; v.volume = Number(e.target.value); v.muted = v.volume === 0; }}
              className="w-0 accent-[var(--frost)] opacity-0 transition-all group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100" />
          </div>
          <span className="ml-2 font-mono text-[12.5px] text-white/85 tabular-nums">{clock(t)} <span className="text-white/45">/ {clock(dur)}</span></span>
          <span className="flex-1" />
          {subs.length > 0 && (
            <button type="button" className={cn(bar, caption && "text-frost")} onClick={() => setCaption((c) => (c ? null : subs.find((s) => s.is_default)?.language ?? subs[0].language))} aria-label="Captions" aria-pressed={!!caption}>
              <Captions className="size-5" />
            </button>
          )}
          <Menu.Root modal={false}>
            <Menu.Trigger className={bar} aria-label="Settings"><Settings className="size-5 transition group-data-[state=open]:rotate-45" /></Menu.Trigger>
            <Menu.Portal container={box.current}>
              <Menu.Content side="top" align="end" sideOffset={10} className={cn(POPUP, "max-h-[60vh] w-[250px] overflow-y-auto")}>
                <div className={POPUP_LABEL}>Server</div>
                {sources.filter((s) => s.id === current?.id || (!dead.has(s.id) && !failed.has(s.id))).map((s) => (
                  <Menu.Item key={s.id} disabled={failed.has(s.id)} className={POPUP_ITEM} onSelect={() => setCurrent(s)}>
                    <span className="w-9 text-[10.5px] font-extrabold uppercase text-plum-muted">{AUDIO[s.audio]}</span>
                    <span className="flex-1">{s.label}</span>{current?.id === s.id && <Check className="size-4" strokeWidth={3} />}
                  </Menu.Item>
                ))}
                <Menu.Separator className={POPUP_SEPARATOR} />
                <div className={POPUP_LABEL}>Speed</div>
                <div className="grid grid-cols-6 gap-1 px-2 pb-2">
                  {SPEEDS.map((s) => (
                    <button key={s} type="button" onClick={() => { if (video.current) video.current.playbackRate = s; }} className={cn("h-8 rounded-lg text-[11.5px] font-extrabold", speed === s ? "bg-frost text-frost-ink" : "bg-cream-tint hover:bg-cream-blush")}>{s}×</button>
                  ))}
                </div>
                {subs.length > 0 && (
                  <>
                    <Menu.Separator className={POPUP_SEPARATOR} />
                    <div className={POPUP_LABEL}>Captions</div>
                    <Menu.Item className={POPUP_ITEM} onSelect={() => setCaption(null)}><span className="flex-1">Off</span>{!caption && <Check className="size-4" strokeWidth={3} />}</Menu.Item>
                    {subs.map((s) => (
                      <Menu.Item key={s.id} className={POPUP_ITEM} onSelect={() => setCaption(s.language)}><span className="flex-1">{s.label}</span>{caption === s.language && <Check className="size-4" strokeWidth={3} />}</Menu.Item>
                    ))}
                  </>
                )}
                <Menu.Separator className={POPUP_SEPARATOR} />
                <Menu.CheckboxItem checked={autoNext} onCheckedChange={setAutoNext} onSelect={(e) => e.preventDefault()} className={POPUP_ITEM}><span className="flex-1">Auto-next</span><Toggle on={autoNext} /></Menu.CheckboxItem>
                <Menu.CheckboxItem checked={autoSkip} onCheckedChange={setAutoSkip} onSelect={(e) => e.preventDefault()} className={POPUP_ITEM}><span className="flex-1">Auto-skip intro</span><Toggle on={autoSkip} /></Menu.CheckboxItem>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
          <button type="button" className={cn(bar, "hidden md:grid", theater && "text-frost")} onClick={() => setTheater(!theater)} aria-label="Theater mode" aria-pressed={theater}><RectangleHorizontal className="size-5" /></button>
          <button type="button" className={cn(bar, "hidden sm:grid")} onClick={() => video.current?.requestPictureInPicture?.().catch(() => {})} aria-label="Picture in picture"><PictureInPicture2 className="size-5" /></button>
          <button type="button" className={bar} onClick={fullscreen} aria-label="Fullscreen">{full ? <Minimize className="size-5" /> : <Maximize className="size-5" />}</button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return <span className={cn("relative h-5 w-9 rounded-full transition", on ? "bg-frost-hot" : "bg-line")}><span className={cn("absolute top-0.5 size-4 rounded-full bg-paper shadow transition-all", on ? "left-[18px]" : "left-0.5")} /></span>;
}
