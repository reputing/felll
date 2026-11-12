"use client";
import type Hls from "hls.js";
import {
  Captions, ChevronRight, FastForward, Loader2, Maximize, Maximize2, Minimize, Pause, PictureInPicture2, Play,
  RectangleHorizontal, RotateCcw, RotateCw, Settings, SkipBack, SkipForward, Smile, Volume1, Volume2, VolumeX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast, useBox } from "@/lib/store";
import { introIsSane, outroIsSane, useSkipPrefs } from "@/lib/use-skip-prefs";
import { REACTIONS } from "@/lib/reactions";
import { fetchAniSkip } from "@/lib/aniskip";
import { clock, cn } from "@/lib/utils";
import { WatchParty } from "./watch-party";
import { SettingsPanel } from "./settings-panel";
import { useSubs } from "./use-subs";
import { SubtitleLayer, useSubStyle } from "./subtitles";
import { type Cue } from "@/lib/subs";

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

export function Player({ sources, subtitles, intro, outroStart, nextHref, prevHref, startAt, meta, poster }: Props) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  // The <video> sits alone in this wrapper: floating-window PiP moves just the video across, and React
  // never inserts a sibling relative to a node that left ("Oh crumbs" when the whole box was moved).
  const videoSlot = useRef<HTMLDivElement>(null);
  const [pipBox, setPipBox] = useState<HTMLElement | null>(null);
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
  // Auto-detected OP/ED from AniSkip (community timestamps, keyed by MAL id+ep).
  const [aniIntro, setAniIntro] = useState<{ start: number; end: number } | null>(null);
  const [aniOutro, setAniOutro] = useState<{ start: number; end: number } | null>(null);
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
  const [caption, setCaption] = useState<string | number | null>(null);
  const [full, setFull] = useState(false);
  const [idle, setIdle] = useState(false);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [nextIn, setNextIn] = useState<number | null>(null);
  // Cancel has to stick for this episode: the outro check below runs on every timeupdate
  // and the ended handler fires again, so without this the countdown restarted the moment
  // it was dismissed ("loops back into that interaction again").
  const nextDismissed = useRef(false);
  // auto-skip jumps once per episode: if the viewer scrubs back into the opening, we leave them there
  const skipped = useRef({ intro: false, outro: false });
  const skip = useSkipPrefs();
  useEffect(() => { nextDismissed.current = false; skipped.current = { intro: false, outro: false }; }, [meta.malId, meta.ep]);
  const [flash, setFlash] = useState<string | null>(null);
  const [stopAfterEp, setStopAfterEp] = useState(false);
  const [sleepMin, setSleepMin] = useState<number | null>(null);
  // settings panel + subtitles (own drawing, upload, timing, style; see subtitles.tsx / lib/subs.ts)
  const [menuOpen, setMenuOpen] = useState(false);
  const swallowClick = useRef(false);
  const [page, setPage] = useState<"main" | "subs">("main");
  const [subStyle, patchSubStyle, resetSubStyle] = useSubStyle();
  const [classicPip, setClassicPip] = useState(false);
  const [docPip, setDocPip] = useState(false);
  // This show's remembered playback speed, applied when a source loads.
  const savedSpeed = useRef<number | null>(null);
  // Crowd-sourced skip markers (fallback when no provider/vault markers) and
  // timeline "moment" reactions for this episode.
  const [crowdIntro, setCrowdIntro] = useState<{ start: number; end: number } | null>(null);
  const [crowdOutro, setCrowdOutro] = useState<{ start: number; end: number } | null>(null);
  const [moments, setMoments] = useState<{ at: number; emoji: string }[]>([]);
  const [reactOpen, setReactOpen] = useState(false);
  const [autoNext, setAutoNext] = usePref("autoNext", true);
  const [theater, setTheater] = usePref("theater", false);
  const [preferDub] = usePref("preferDub", false);
  const started = useRef(false);
  const lastSent = useRef(0);
  const ended = useRef(false);
  const engaged = useRef(false); // has the viewer started playback at least once
  const [docked, setDocked] = useState(false); // scrolled past → corner mini

  // Effective skip markers, by priority: the provider's own markers (Anivexa),
  // then auto-detected AniSkip, then the vault's stored markers, then crowd.
  const introStart = streamIntro?.start ?? aniIntro?.start ?? intro.start ?? crowdIntro?.start ?? null;
  const introEnd = streamIntro?.end ?? aniIntro?.end ?? intro.end ?? crowdIntro?.end ?? null;
  const outroStartEff = streamOutro?.start ?? aniOutro?.start ?? outroStart ?? crowdOutro?.start ?? null;

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

  // honour the "prefer dub" setting once it loads from localStorage
  useEffect(() => {
    if (!preferDub) return;
    const d = sources.find((s) => s.audio === "dub" && !failed.has(s.id));
    if (d && current?.audio !== "dub") setCurrent(d);
  }, [preferDub]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-show memory: the audio track and speed you last used on THIS show win
  // over the global defaults.
  useEffect(() => {
    try {
      savedSpeed.current = Number(localStorage.getItem(`speed:${meta.malId}`)) || null;
      const a = localStorage.getItem(`audio:${meta.malId}`);
      if (a) { const want = sources.find((s) => s.audio === a && !failed.has(s.id)); if (want) setCurrent(want); }
    } catch { /* storage off */ }
  }, [meta.malId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pick a server AND remember this show's audio preference.
  const pick = useCallback((s: Source) => {
    setCurrent(s);
    try { localStorage.setItem(`audio:${meta.malId}`, s.audio); } catch { /* storage off */ }
  }, [meta.malId]);

  // ---- subtitles (the engine lives in use-subs.ts, shared with the movie player) ---------------
  const subKey = `a:${meta.malId}:${meta.ep}`;
  const subs0 = extraSubs.length ? extraSubs : subtitles;   // the stream's own tracks
  const { mine, cues, offset, setOffset, sync, uploadSubs, removeMine, downloadSubs, autoSync, overlayOn } = useSubs({ video, subKey, title: meta.title, ep: meta.ep, tracks: subs0, caption, setCaption });

  // ---- picture in picture ---------------------------------------------------------------------
  // Chrome/Edge: the whole player (our subtitles and controls included) moves into a floating window.
  // Elsewhere the video alone floats, and our cues are handed to the browser so they still show.
  const pipWin = useRef<Window | null>(null);
  const togglePip = useCallback(async () => {
    const v = video.current, el = box.current;
    if (!v || !el) return;
    if (document.pictureInPictureElement) { await document.exitPictureInPicture().catch(() => {}); return; }
    if (pipWin.current) { pipWin.current.close(); return; }
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow(o: { width: number; height: number }): Promise<Window> } }).documentPictureInPicture;
    if (dpip) {
      try {
        const w = await dpip.requestWindow({ width: Math.min(720, el.clientWidth), height: Math.min(405, el.clientHeight) });
        // the player's styles come with it
        for (const sheet of Array.from(document.styleSheets)) {
          try { const st = w.document.createElement("style"); st.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n"); w.document.head.appendChild(st); }
          catch { if (sheet.href) { const l = w.document.createElement("link"); l.rel = "stylesheet"; l.href = sheet.href; w.document.head.appendChild(l); } }
        }
        w.document.documentElement.className = document.documentElement.className;
        w.document.documentElement.setAttribute("style", document.documentElement.getAttribute("style") || "");
        for (const a of Array.from(document.documentElement.attributes)) if (a.name.startsWith("data-")) w.document.documentElement.setAttribute(a.name, a.value);
        w.document.body.style.cssText = "margin:0;background:#000;height:100vh;overflow:hidden";
        // the floating player: the video moves in, the controls are portalled in beside it
        const pb = w.document.createElement("div");
        pb.className = "group/player relative size-full overflow-hidden bg-black select-none";
        w.document.body.append(pb);
        const slotEl = videoSlot.current;
        pb.appendChild(v);
        pipWin.current = w; setPipBox(pb); setDocPip(true);
        v.play().catch(() => {}); // moving a video between documents can pause it
        w.addEventListener("pagehide", () => {
          if (slotEl && !slotEl.contains(v)) slotEl.appendChild(v);
          pipWin.current = null; setPipBox(null); setDocPip(false);
        });
        return;
      } catch { /* fall back to the plain video window */ }
    }
    v.requestPictureInPicture?.().catch(() => {});
  }, []);
  useEffect(() => () => pipWin.current?.close(), []);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const on = () => setClassicPip(true), off = () => setClassicPip(false);
    v.addEventListener("enterpictureinpicture", on); v.addEventListener("leavepictureinpicture", off);
    return () => { v.removeEventListener("enterpictureinpicture", on); v.removeEventListener("leavepictureinpicture", off); };
  }, []);
  // plain PiP can't show our overlay, so give the browser the (time-shifted) cues as a track while it's open
  useEffect(() => {
    const v = video.current;
    if (!classicPip || !v || !cues.length) return;
    const tt = v.addTextTrack("subtitles", "cupcake", "en");
    tt.mode = "showing";
    for (const c of cues) { try { tt.addCue(new VTTCue(c.start + offset, c.end + offset, c.text.replace(/<[^>]+>/g, ""))); } catch { /* bad cue */ } }
    return () => { tt.mode = "disabled"; Array.from(tt.cues ?? []).forEach((c) => tt.removeCue(c)); };
  }, [classicPip, cues, offset]);

  // close the settings panel on an outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: Event) => {
      if ((e.target as HTMLElement).closest?.("[data-settings]")) return;
      setMenuOpen(false); setPage("main");
      // the click that follows this press only meant "close the menu", not "pause the video"
      swallowClick.current = true; setTimeout(() => { swallowClick.current = false; }, 250);
    };
    const pd = pipBox?.ownerDocument;
    document.addEventListener("pointerdown", onDown);
    pd?.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("pointerdown", onDown); pd?.removeEventListener("pointerdown", onDown); };
  }, [menuOpen, pipBox]);

  // Sleep timer: pause after N minutes.
  useEffect(() => {
    if (sleepMin == null) return;
    const id = setTimeout(() => { video.current?.pause(); setFlash("Sleep timer paused"); setSleepMin(null); }, sleepMin * 60_000);
    return () => clearTimeout(id);
  }, [sleepMin]);

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
        // Auto-quality: hls.js adapts to bandwidth on its own; on Data Saver or a
        // 2g/3g connection, start low and cap to the middle rung to save data.
        const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
        const thrifty = !!conn?.saveData || /2g|3g/.test(conn?.effectiveType ?? "");
        const h = new HlsJs({ capLevelToPlayerSize: true, startPosition: resumeAt > 5 ? resumeAt : -1, startLevel: thrifty ? 0 : -1, capLevelOnFPSDrop: true });
        hls.current = h;
        if (thrifty) h.on(HlsJs.Events.MANIFEST_PARSED, () => { if (h.levels.length > 2) h.autoLevelCapping = Math.floor((h.levels.length - 1) / 2); });
        h.on(HlsJs.Events.ERROR, (_e, data) => { if (data.fatal) { h.destroy(); fallback(current); } });
        h.loadSource(url);
        h.attachMedia(v);
      }
      const onMeta = () => {
        if (resumeAt > 5 && Math.abs(v.currentTime - resumeAt) > 2) v.currentTime = resumeAt;
        if (savedSpeed.current && savedSpeed.current !== 1) v.playbackRate = savedSpeed.current;
      };
      v.addEventListener("loadedmetadata", onMeta, { once: true });
      v.play().catch(() => {});
    })().catch(() => fallback(current));
    return () => { cancelled = true; };
  }, [current, fallback, startAt]);

  useEffect(() => () => hls.current?.destroy(), []);

  // Warm the next episode's page so "Next" / auto-next is instant.
  useEffect(() => { if (nextHref) router.prefetch?.(nextHref); }, [nextHref, router]);

  // Auto-detected OP/ED (AniSkip) + crowd fallback + timeline moments, per episode.
  useEffect(() => {
    let on = true;
    setAniIntro(null); setAniOutro(null); setCrowdIntro(null); setCrowdOutro(null); setMoments([]);
    // AniSkip is keyed by MAL id + episode — no manual marking. Refined with the
    // real episode length once it's known (see the duration effect below).
    fetchAniSkip(meta.malId, meta.ep).then((s) => { if (on) { setAniIntro(s.intro); setAniOutro(s.outro); } }).catch(() => {});
    fetch(`/api/skip?malId=${meta.malId}&ep=${meta.ep}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (on && d) { setCrowdIntro(d.intro ?? null); setCrowdOutro(d.outro ?? null); } }).catch(() => {});
    fetch(`/api/moments?malId=${meta.malId}&ep=${meta.ep}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (on && Array.isArray(d?.moments)) setMoments(d.moments.slice(0, 80)); }).catch(() => {});
    return () => { on = false; };
  }, [meta.malId, meta.ep]);

  // Once the real duration is known, re-query AniSkip with it for a tighter
  // match (it disambiguates episodes that have multiple length variants).
  useEffect(() => {
    if (!dur) return;
    let on = true;
    fetchAniSkip(meta.malId, meta.ep, dur).then((s) => { if (on && (s.intro || s.outro)) { setAniIntro(s.intro); setAniOutro(s.outro); } }).catch(() => {});
    return () => { on = false; };
  }, [dur, meta.malId, meta.ep]);

  // Drop an emoji on the timeline at the current second.
  const react = useCallback((emoji: string) => {
    const v = video.current;
    if (!v) return;
    const at = Math.floor(v.currentTime);
    setMoments((m) => [...m, { at, emoji }]);
    setReactOpen(false);
    setFlash(emoji);
    fetch("/api/moments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ malId: meta.malId, ep: meta.ep, at, emoji }) }).catch(() => {});
  }, [meta.malId, meta.ep]);

  // Dock to a corner mini once the player scrolls up out of view (after the
  // viewer has started it). Scrolling back to it restores the full player. Same
  // <video>, so playback never skips.
  useEffect(() => {
    const el = anchor.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setDocked(engaged.current && !e.isIntersecting && e.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Hide servers that won't play. Only the external (Anivexa) servers need
  // checking (local vault rows are known-ready). This used to fire for every
  // server on every episode load — a resolve storm on the backend — so it now
  // runs once, lazily, the first time the viewer opens the server menu.
  const probeRan = useRef(false);
  const probeAc = useRef<AbortController | null>(null);
  const probeServers = useCallback(() => {
    if (probeRan.current) return;
    probeRan.current = true;
    const probe = sources.filter((s) => typeof s.id === "string" && s.id.startsWith("anivexa:"));
    if (!probe.length) return;
    const ac = new AbortController();
    probeAc.current = ac;
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
  }, [sources, current]);
  useEffect(() => () => probeAc.current?.abort(), []);


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

  // in the floating window the pointer drives the same fade-the-controls behaviour
  useEffect(() => {
    if (!pipBox) return;
    const m = () => wake(), l = () => { if (video.current && !video.current.paused) setIdle(true); };
    pipBox.addEventListener("mousemove", m); pipBox.addEventListener("mouseleave", l);
    return () => { pipBox.removeEventListener("mousemove", m); pipBox.removeEventListener("mouseleave", l); };
  }, [pipBox, wake]);

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
  // The browser's own floating window (and phone lock screens) get skip back/forward 10s and
  // previous/next episode, so you aren't stuck without them when the page isn't in front.
  useEffect(() => {
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (!ms) return;
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => { try { ms.setActionHandler(a, h); } catch { /* unsupported action */ } };
    try { ms.metadata = new MediaMetadata({ title: `${meta.title} · Episode ${meta.ep}`, artist: "cupcake.gg", artwork: meta.image ? [{ src: meta.image }] : [] }); } catch { /* */ }
    set("seekbackward", () => seekBy(-10));
    set("seekforward", () => seekBy(10));
    set("previoustrack", prevHref ? () => router.push(prevHref) : null);
    set("nexttrack", nextHref ? () => router.push(nextHref) : null);
    return () => { set("seekbackward", null); set("seekforward", null); set("previoustrack", null); set("nexttrack", null); };
  }, [seekBy, prevHref, nextHref, router, meta.title, meta.ep, meta.image]);
  const fullscreen = useCallback(() => {
    const el = box.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitExitFullscreen?: () => void; webkitDisplayingFullscreen?: boolean }) | null;
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const orient = (screen as Screen & { orientation?: { lock?: (o: string) => Promise<void>; unlock?: () => void } }).orientation;
    // already fullscreen → leave (and let the phone rotate back)
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.();
      try { orient?.unlock?.(); } catch { /* desktop */ }
      return;
    }
    if (v?.webkitDisplayingFullscreen) { v.webkitExitFullscreen?.(); return; }
    // Desktop / Android / iPad: fullscreen the whole player so our controls come
    // along, then turn the phone to landscape so the video actually fills.
    if (el?.requestFullscreen) {
      el.requestFullscreen()
        .then(() => { try { orient?.lock?.("landscape").catch(() => {}); } catch { /* unsupported */ } })
        .catch(() => { if (v?.webkitEnterFullscreen) v.webkitEnterFullscreen(); });
      return;
    }
    if (el?.webkitRequestFullscreen) { el.webkitRequestFullscreen(); return; }
    // iPhone Safari: only the <video> itself can go fullscreen (native controls).
    if (v?.webkitEnterFullscreen) { v.webkitEnterFullscreen(); return; }
  }, []);

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element };
    const orient = (screen as Screen & { orientation?: { unlock?: () => void } }).orientation;
    const onFs = () => {
      const f = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
      setFull(f);
      if (!f) try { orient?.unlock?.(); } catch { /* desktop */ }
    };
    const v = video.current;
    const onVid = () => setFull(!!(v as (HTMLVideoElement & { webkitDisplayingFullscreen?: boolean }) | null)?.webkitDisplayingFullscreen);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    v?.addEventListener("webkitbeginfullscreen", onVid);
    v?.addEventListener("webkitendfullscreen", onVid);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
      v?.removeEventListener("webkitbeginfullscreen", onVid);
      v?.removeEventListener("webkitendfullscreen", onVid);
    };
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
        c: () => setCaption((c) => { const l = extraSubs.length ? extraSubs : subtitles; return c ? null : mine ? "mine" : (l.find((s) => s.is_default) ?? l[0])?.id ?? null; }),
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
    const pd = pipBox?.ownerDocument;
    pd?.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); pd?.removeEventListener("keydown", onKey); };
  }, [pipBox, toggle, fullscreen, seekBy, theater, setTheater, subtitles, extraSubs, mine, introEnd, nextHref, prevHref, router, wake]);

  // Captions: our own drawing handles every track we could read; the browser's <track> only
  // draws the chosen one when we couldn't (e.g. a cross-origin file we may not fetch).
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    // match <track> elements to our list by order, and show only the one whose unique id is
    // selected: providers hand back several tracks with the same language code
    Array.from(v.textTracks).forEach((tr, i) => { if (i < subs0.length) tr.mode = !overlayOn && subs0[i].id === caption ? "showing" : "disabled"; });
  }, [caption, current, subs0, overlayOn]);

  const onTime = () => {
    const v = video.current!;
    setT(v.currentTime);
    if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    report();
    // Auto-skip (off until the viewer turns it on). Markers come from the stream, AniSkip, the vault or the crowd; a jump nobody
    // tapped for must pass a sanity check first (see lib/use-skip-prefs.ts).
    if (skip.intro && !skipped.current.intro && introStart != null && introEnd != null && v.currentTime >= introStart && v.currentTime < introEnd && introIsSane(introStart, introEnd, v.duration || dur)) {
      skipped.current.intro = true;
      v.currentTime = introEnd;
      toast("Skipped intro");
      return;
    }
    if (skip.outro && !skipped.current.outro && nextHref && !stopAfterEp && !nextDismissed.current && outroStartEff != null && v.currentTime >= outroStartEff && outroIsSane(outroStartEff, v.duration || dur)) {
      skipped.current.outro = true;
      toast("Skipped outro");
      router.push(nextHref);
      return;
    }
    if (autoNext && !stopAfterEp && nextHref && !nextDismissed.current && outroStartEff != null && v.currentTime >= outroStartEff && nextIn === null) setNextIn(8);
  };

  if (!sources.length) return null;
  const dock = docked && !full && !docPip;

  // Local episodes carry their subtitles as a prop; Anivexa streams return them
  // with the stream (extraSubs). Only one applies to a given source.
  const subs: Track[] = mine ? [{ id: "mine", language: "und", label: `My file · ${mine.name}`, url: "", is_default: 0 }, ...subs0] : subs0;

  const inIntro = introStart != null && introEnd != null && t >= introStart && t < introEnd;
  const inOutro = outroStartEff != null && nextHref != null && t >= outroStartEff;
  const VolIcon = muted || vol === 0 ? VolumeX : vol < 0.5 ? Volume1 : Volume2;
  const pct = dur ? (t / dur) * 100 : 0;
  const hidden = playing && idle && !hover && !menuOpen;

  const bar = "grid size-10 place-items-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white";

  // Everything drawn over the picture. While the player floats in its own window this is rendered
  // into that window through a portal (so React's events work there) and the <video> element alone is
  // moved across; the main page keeps an empty box with a "Bring it back" note.
  const chrome = (
    <>
      {dock && (
        <button type="button" onClick={() => anchor.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
          aria-label="Back to full player"
          className="absolute left-2 top-2 z-10 grid size-7 place-items-center rounded-full bg-black/60 text-white/90 backdrop-blur transition hover:bg-black/80 hover:text-white">
          <Maximize2 className="size-3.5" />
        </button>
      )}
      {!dock && (
        <div className={cn("absolute right-3 top-3 z-10 transition-opacity duration-300", hidden && "pointer-events-none opacity-0")}>
          <WatchParty video={video} malId={meta.malId} ep={meta.ep} title={meta.title} image={meta.image} />
        </div>
      )}
      {!classicPip && <SubtitleLayer video={video} cues={overlayOn ? cues : []} offset={offset} style={subStyle} preview={menuOpen && page === "subs"} />}

      {/* Cupcake broadcaster bug: a soft watermark while you're on our own server. */}
      {current?.label === "Cupcake" && !dock && !error && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/cupcake.png"
          alt=""
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-3.5 top-3.5 z-[5] size-11 select-none drop-shadow-[0_2px_8px_rgba(0,0,0,.65)] transition-opacity duration-500",
            hidden ? "opacity-15" : "opacity-35",
          )}
        />
      )}

      {/* centre states */}
      {loading && !error && <div className="pointer-events-none absolute inset-0 grid place-items-center"><Loader2 className="size-12 animate-spin text-frost" /></div>}
      {!playing && !loading && !error && nextIn === null && (
        <button type="button" onClick={toggle} aria-label="Play" className="absolute left-1/2 top-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-frost text-frost-ink shadow-[0_0_0_10px_rgb(var(--glow)/.25)] transition hover:scale-105">
          <Play className="ml-1 size-8" fill="currentColor" />
        </button>
      )}
      {flash && <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-5 py-2.5 text-[15px] font-extrabold text-white backdrop-blur animate-in fade-in zoom-in-90">{flash}</div>}
      {error && <div className="absolute inset-0 grid place-items-center bg-black/85 p-6 text-center text-[15px] font-bold text-white">{error}</div>}

      {/* skip buttons — always a tap, never automatic */}
      {inIntro && (
        <button type="button" onClick={() => { video.current!.currentTime = introEnd!; }} className="absolute bottom-24 right-5 z-20 flex h-11 items-center gap-2 rounded-full border-1.5 border-white/30 bg-black/60 px-5 text-[14px] font-extrabold text-white backdrop-blur-md transition hover:bg-frost hover:text-frost-ink animate-in fade-in slide-in-from-right-4">
          <FastForward className="size-4" /> Skip intro
        </button>
      )}
      {inOutro && nextIn === null && (
        <button type="button" onClick={() => router.push(nextHref!)} className="absolute bottom-24 right-5 z-20 flex h-11 items-center gap-2 rounded-full bg-frost px-5 text-[14px] font-extrabold text-frost-ink shadow-press animate-in fade-in slide-in-from-right-4">
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
              <button type="button" onClick={() => { nextDismissed.current = true; setNextIn(null); }} className="h-10 rounded-full border-1.5 border-white/30 px-5 text-[13.5px] font-bold hover:bg-white/10">Cancel</button>
              <button type="button" onClick={() => router.push(nextHref)} className="h-10 rounded-full bg-frost px-5 text-[13.5px] font-extrabold text-frost-ink">Play now</button>
            </div>
          </div>
        </div>
      )}

      {menuOpen && (
        <div data-settings>
          <SettingsPanel
            sources={sources} current={current} dead={dead} failed={failed} onPick={pick}
            speed={speed} onSpeed={(x) => { if (video.current) video.current.playbackRate = x; }}
            subs={subs} caption={caption} onCaption={setCaption}
            mineName={mine?.name ?? null} onUpload={uploadSubs} onRemoveMine={removeMine}
            offset={offset} onOffset={setOffset} onAutoSync={autoSync} sync={sync} hasCues={cues.length > 0} onDownload={downloadSubs}
            style={subStyle} onStyle={patchSubStyle} onResetStyle={resetSubStyle}
            autoNext={autoNext} onAutoNext={setAutoNext} stopAfter={stopAfterEp} onStopAfter={setStopAfterEp}
            autoSkipIntro={skip.intro} onAutoSkipIntro={skip.setIntro} autoSkipOutro={skip.outro} onAutoSkipOutro={skip.setOutro}
            sleepMin={sleepMin} onSleep={setSleepMin}
            page={page} onPage={setPage} onClose={() => { setMenuOpen(false); setPage("main"); }}
          />
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
          {dur > 0 && moments.map((m, i) => (
            <span key={i} className="pointer-events-none absolute top-0 -translate-x-1/2 text-[10px] leading-none opacity-80" style={{ left: `${Math.min(100, (m.at / dur) * 100)}%` }}>{m.emoji}</span>
          ))}
          {hover && dur > 0 && <div className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-lg bg-black/80 px-2 py-1 font-mono text-[11.5px] text-white" style={{ left: `${hover.x}%` }}>{clock(hover.t)}</div>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={bar} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5" fill="currentColor" />}</button>
          <button type="button" className={cn(bar, "relative")} onClick={() => seekBy(-10)} aria-label="Back 10 seconds" title="Back 10s (J)"><RotateCcw className="size-[19px]" /><span className="pointer-events-none absolute text-[7.5px] font-black leading-none">10</span></button>
          <button type="button" className={cn(bar, "relative")} onClick={() => seekBy(10)} aria-label="Forward 10 seconds" title="Forward 10s (L)"><RotateCw className="size-[19px]" /><span className="pointer-events-none absolute text-[7.5px] font-black leading-none">10</span></button>
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
          <div className="relative">
            <button type="button" className={cn(bar, reactOpen && "text-frost")} onClick={() => setReactOpen((o) => !o)} aria-label="React" aria-expanded={reactOpen}><Smile className="size-5" /></button>
            {reactOpen && (
              <div className="absolute bottom-12 right-0 flex gap-1 rounded-full border-1.5 border-night-line bg-night/95 px-2 py-1.5 shadow-[0_12px_28px_-12px_rgba(0,0,0,.8)] backdrop-blur animate-in fade-in slide-in-from-bottom-2">
                {REACTIONS.map((e) => <button key={e} type="button" onClick={() => react(e)} className="grid size-8 place-items-center rounded-full text-[18px] transition hover:scale-125 hover:bg-white/10">{e}</button>)}
              </div>
            )}
          </div>
          {subs.length > 0 && (
            <button type="button" className={cn(bar, caption && "text-frost")} onClick={() => setCaption((c) => (c ? null : mine ? "mine" : (subs.find((s) => s.is_default) ?? subs[0])?.id ?? null))} aria-label="Captions" aria-pressed={!!caption}>
              <Captions className="size-5" />
            </button>
          )}
          <div className="relative" data-settings>
            <button type="button" className={cn(bar, menuOpen && "text-frost")} aria-label="Settings" aria-expanded={menuOpen}
              onClick={() => { setMenuOpen((o) => { if (!o) { probeServers(); setPage("main"); } return !o; }); }}>
              <Settings className={cn("size-5 transition", menuOpen && "rotate-45")} />
            </button>
          </div>
          <button type="button" className={cn(bar, "hidden md:grid", theater && "text-frost")} onClick={() => setTheater(!theater)} aria-label="Theater mode" aria-pressed={theater}><RectangleHorizontal className="size-5" /></button>
          <button type="button" className={cn(bar, "hidden sm:grid", (docPip || classicPip) && "text-frost")} onClick={togglePip} aria-label="Picture in picture" aria-pressed={docPip || classicPip}><PictureInPicture2 className="size-5" /></button>
          <button type="button" className={bar} onClick={fullscreen} aria-label="Fullscreen">{full ? <Minimize className="size-5" /> : <Maximize className="size-5" />}</button>
        </div>
      </div>
    </>
  );

  return (
    <div ref={anchor} className="relative w-full">
      {dock && <div aria-hidden className="aspect-video w-full rounded-[26px] border-1.5 border-night-line bg-night" />}
    <div ref={box} onMouseMove={wake} onMouseLeave={() => playing && setIdle(true)}
      className={cn("group/player relative aspect-video w-full overflow-hidden rounded-[26px] border-1.5 border-night-line bg-black shadow-[0_30px_60px_-30px_rgba(0,0,0,.9)] select-none", full && "rounded-none border-0", hidden && "cursor-none", dock && "fixed bottom-4 right-4 z-40 w-[min(384px,calc(100vw-1.5rem))] rounded-2xl shadow-[0_24px_48px_-20px_rgba(0,0,0,.8)] ring-1 ring-black/50 animate-in fade-in slide-in-from-bottom-4")}>
      <div ref={videoSlot} className="size-full">
        <video
          ref={video}
          playsInline
          poster={poster ?? undefined}
          className="size-full bg-black object-contain"
          onClick={() => { if (!swallowClick.current) toggle(); }}
          onDoubleClick={fullscreen}
          onPlay={() => { setPlaying(true); ended.current = false; engaged.current = true; wake(); }}
          onPause={() => { setPlaying(false); setIdle(false); report(true); }}
          onWaiting={() => setLoading(true)}
          onPlaying={() => setLoading(false)}
          onCanPlay={() => setLoading(false)}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
          onDurationChange={(e) => setDur(e.currentTarget.duration)}
          onTimeUpdate={onTime}
          onVolumeChange={(e) => { setVol(e.currentTarget.volume); setMuted(e.currentTarget.muted); }}
          onRateChange={(e) => { setSpeed(e.currentTarget.playbackRate); savedSpeed.current = e.currentTarget.playbackRate; try { localStorage.setItem(`speed:${meta.malId}`, String(e.currentTarget.playbackRate)); } catch { /* storage off */ } }}
          onEnded={() => { ended.current = true; report(true); if (autoNext && !stopAfterEp && nextHref && !nextDismissed.current) setNextIn((n) => n ?? 5); }}
        >
          {subs0.map((s) => <track key={s.id} kind="subtitles" src={s.url} srcLang={s.language} label={s.label} />)}
        </video>
      </div>
      {docPip && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-night text-center text-night-text">
          <div className="flex flex-col items-center gap-3 p-4"><PictureInPicture2 className="size-8 text-frost" /><p className="text-[14px] font-bold">Playing in the floating window</p>
            <button type="button" onClick={() => pipWin.current?.close()} className="h-9 rounded-full bg-frost px-4 text-[13px] font-extrabold text-frost-ink">Bring it back</button></div>
        </div>
      )}
      {docPip && pipBox ? createPortal(chrome, pipBox) : chrome}
    </div>
    </div>
  );
}
