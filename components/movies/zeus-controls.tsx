"use client";
import { Captions, ChevronRight, Maximize, Minimize, Pause, Play, RectangleHorizontal, RotateCcw, RotateCw, Settings, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { SettingsPanel } from "@/components/watch/settings-panel";
import { SubtitleLayer, useSubStyle } from "@/components/watch/subtitles";
import { useSubs } from "@/components/watch/use-subs";
import type { Source, Track } from "@/components/watch/player";
import { toast } from "@/lib/store";
import { cn, clock } from "@/lib/utils";

// Our own control bar for Zeus: the same bar, seek line, buttons and cupcake bug as the anime player, drawn over a frame whose
// own controls are switched off (CineSrc's documented `controls=false`). It drives the video with CineSrc's documented
// postMessage commands (play, pause, seek, setVolume, setMuted, setPlaybackRate) and follows its events (play, pause,
// timeupdate, volumechange, ratechange, ended), which are only believed from its own origin and its own frame.
const bar = "grid size-10 place-items-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white";

// Zeus's servers, in the order CineSrc lists them, under Greek names like the anime servers. The ids are CineSrc's own
// (the `lastserver` option and the `sourceused` event use them). A server that does not carry a title is skipped by CineSrc,
// so asking for one is a preference: the player says so when it ends up on a different one.
export const ZEUS_SERVERS: { id: string; name: string }[] = [
  { id: "nebula", name: "Zeus" }, { id: "light", name: "Apollo" }, { id: "wave", name: "Poseidon" }, { id: "orbit", name: "Athena" },
  { id: "storm", name: "Ares" }, { id: "aurora", name: "Eos" }, { id: "flux", name: "Hermes" }, { id: "river", name: "Hera" },
  { id: "surge", name: "Dionysus" }, { id: "mist", name: "Artemis" }, { id: "tempest", name: "Hephaestus" }, { id: "thunder", name: "Hades" },
];
const serverName = (id: string | null) => ZEUS_SERVERS.find((x) => x.id === id)?.name ?? id ?? "";
const LS = { autoNext: "kuro:movieAutoNext", lang: "kuro:movieSubLang" };

export interface SubsFor { imdb: string; media: "movie" | "tv"; season?: number; episode?: number; subKey: string; title: string }
export interface Prefs { autoNext: boolean; stopAfter: boolean }

export interface Hop { href: string; label: string }

export function ZeusControls({ frame, box, origin, ready, prev, next, theater, onTheater, full, onFull, subsFor, onServer, onPrefs }: {
  frame: RefObject<HTMLIFrameElement | null>; box: RefObject<HTMLDivElement | null>; origin: string; ready: boolean;
  prev?: Hop; next?: Hop; theater: boolean; onTheater: () => void; full: boolean; onFull: () => void;
  subsFor?: SubsFor; onServer: (id: string, at: number) => void; onPrefs: (p: Prefs) => void;
}) {
  const router = useRouter();
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [idle, setIdle] = useState(false);
  const [menu, setMenu] = useState(false);
  const [page, setPage] = useState<"main" | "subs">("main");
  const [used, setUsed] = useState<string | null>(null);
  const asked = useRef<string | null>(null);
  const [autoNext, setAutoNext] = useState(true);
  const [stopAfter, setStopAfter] = useState(false);
  const [sleepMin, setSleepMin] = useState<number | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [caption, setCaption] = useState<string | number | null>(null);
  const [subStyle, patchSubStyle, resetSubStyle] = useSubStyle();
  // the subtitle layer reads a "video clock"; a frame has none, so this stands in for one, fed by the player's events and
  // run forward between them so lines are not late
  const clockRef = useRef({ currentTime: 0 });
  const base = useRef({ t: 0, at: 0, playing: false, rate: 1 });
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const poke = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrubbing = useRef(false);

  const send = useCallback((command: string, args: unknown[] = []) => {
    frame.current?.contentWindow?.postMessage({ type: "cinesrc:command", command, args }, origin);
  }, [frame, origin]);

  // --- what the player says ---------------------------------------------------------------------------------------
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow) return;
      const d = e.data;
      if (!d || typeof d.type !== "string") return;
      switch (d.type) {
        case "cinesrc:play": setPlaying(true); base.current = { ...base.current, playing: true, at: performance.now() }; break;
        case "cinesrc:pause": case "cinesrc:ended": setPlaying(false); base.current = { ...base.current, playing: false, t: clockRef.current.currentTime, at: performance.now() }; break;
        case "cinesrc:sourceused": {
          const id = String(d.sourceId);
          setUsed(id);
          if (asked.current && asked.current !== id) toast(`${serverName(asked.current)} doesn’t have this one, using ${serverName(id)}`);
          asked.current = null;
          break;
        }
        case "cinesrc:loadedmetadata": if (d.duration > 0) setDur(d.duration); break;
        case "cinesrc:timeupdate": if (!scrubbing.current) setT(Number(d.currentTime) || 0); if (d.duration > 0) setDur(d.duration); base.current = { ...base.current, t: Number(d.currentTime) || 0, at: performance.now() }; break;
        case "cinesrc:seeked": setT(Number(d.currentTime) || 0); base.current = { ...base.current, t: Number(d.currentTime) || 0, at: performance.now() }; break;
        case "cinesrc:volumechange": setVol(Number(d.volume)); setMuted(!!d.muted); break;
        case "cinesrc:ratechange": setRate(Number(d.playbackRate) || 1); base.current = { ...base.current, t: clockRef.current.currentTime, at: performance.now(), rate: Number(d.playbackRate) || 1 }; break;
        case "cinesrc:response":
          if (d.command === "getVolume") setVol(Number(d.result));
          else if (d.command === "getMuted") setMuted(!!d.result);
          else if (d.command === "getPaused") setPlaying(!d.result);
          break;
      }
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [origin, frame]);
  // once it is ready, ask where it stands (a volume the viewer set last time, whether it autoplayed)
  useEffect(() => { if (ready) { send("getVolume"); send("getMuted"); send("getPaused"); } }, [ready, send]);

  useEffect(() => {
    let raf = 0;
    const tick = () => { const b = base.current; clockRef.current.currentTime = b.t + (b.playing ? ((performance.now() - b.at) / 1000) * b.rate : 0); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // playback choices, remembered; the page reads them when an episode ends
  useEffect(() => { try { setAutoNext(localStorage.getItem(LS.autoNext) !== "0"); } catch { /* */ } }, []);
  useEffect(() => { onPrefs({ autoNext, stopAfter }); }, [autoNext, stopAfter]); // eslint-disable-line react-hooks/exhaustive-deps
  const setAuto = (v: boolean) => { setAutoNext(v); try { localStorage.setItem(LS.autoNext, v ? "1" : "0"); } catch { /* */ } };
  useEffect(() => {
    if (sleepMin == null) return;
    const id = setTimeout(() => { send("pause"); setSleepMin(null); toast("Sleep timer: paused"); }, sleepMin * 60_000);
    return () => clearTimeout(id);
  }, [sleepMin, send]);

  // --- subtitles: the tracks for this film or episode, and the language you used last time --------------------------
  const sk = subsFor ? `${subsFor.imdb}:${subsFor.season ?? 0}:${subsFor.episode ?? 0}` : "";
  useEffect(() => {
    if (!subsFor) return;
    let on = true;
    setTracks([]); setCaption(null);
    const qs = new URLSearchParams({ imdb: subsFor.imdb, ...(subsFor.season ? { se: String(subsFor.season), ep: String(subsFor.episode ?? 1) } : {}) });
    fetch(`/api/movie/subs?${qs}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!on) return;
      const list: Track[] = d?.tracks ?? [];
      setTracks(list);
      let want = ""; try { want = localStorage.getItem(LS.lang) || ""; } catch { /* */ }
      const hit = want ? list.find((t) => t.language === want) : null;
      if (hit) setCaption((c) => c ?? hit.id);
    }).catch(() => {});
    return () => { on = false; };
  }, [sk]); // eslint-disable-line react-hooks/exhaustive-deps
  const subs = useSubs({ video: clockRef as unknown as RefObject<HTMLVideoElement | null>, subKey: subsFor?.subKey ?? "m:none", title: subsFor?.title ?? "movie", ep: subsFor?.season ? subsFor.episode ?? null : null, tracks, caption, setCaption });
  const pickCaption = (id: string | number | null) => {
    setCaption(id);
    try { const t = tracks.find((x) => x.id === id); if (t) localStorage.setItem(LS.lang, t.language); else if (id == null) localStorage.removeItem(LS.lang); } catch { /* */ }
  };
  useEffect(() => { if (subs.mine) setCaption((c) => c ?? "mine"); }, [subs.mine]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- fading the controls out while it plays ----------------------------------------------------------------------
  const wake = useCallback(() => { setIdle(false); clearTimeout(poke.current); poke.current = setTimeout(() => setIdle(true), 2600); }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.addEventListener("mousemove", wake); el.addEventListener("touchstart", wake, { passive: true });
    return () => { el.removeEventListener("mousemove", wake); el.removeEventListener("touchstart", wake); clearTimeout(poke.current); };
  }, [box, wake]);
  const hidden = playing && idle && !menu && !hover;
  const closeMenu = () => { setMenu(false); setPage("main"); };

  // --- actions -----------------------------------------------------------------------------------------------------
  const say = (s: string) => { setFlash(s); setTimeout(() => setFlash((f) => (f === s ? null : f)), 700); };
  const toggle = useCallback(() => { if (playing) { send("pause"); } else { send("play"); } setPlaying(!playing); }, [playing, send]);
  const seekTo = useCallback((s: number) => { const v = Math.max(0, dur ? Math.min(dur - 0.5, s) : s); send("seek", [v]); setT(v); }, [dur, send]);
  const seekBy = useCallback((d: number) => { seekTo(t + d); say(d > 0 ? `+${d}s` : `${d}s`); }, [seekTo, t]);
  const setVolume = (v: number) => { send("setVolume", [v]); send("setMuted", [v === 0]); setVol(v); setMuted(v === 0); };
  const toggleMute = () => { send("setMuted", [!muted]); setMuted(!muted); };
  const pickRate = (r: number) => { send("setPlaybackRate", [r]); setRate(r); };
  const pickServer = (id: string) => { asked.current = id; onServer(id, clockRef.current.currentTime); closeMenu(); toast(`Switching to ${serverName(id)}…`); };

  // keys, the way the anime player has them: space/k play, j/l back and forward 10s, arrows 5s, m mute, f fullscreen, t theater
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") { e.preventDefault(); toggle(); wake(); }
      else if (k === "j") { seekBy(-10); wake(); }
      else if (k === "l") { seekBy(10); wake(); }
      else if (k === "arrowleft") { e.preventDefault(); seekBy(-5); wake(); }
      else if (k === "arrowright") { e.preventDefault(); seekBy(5); wake(); }
      else if (k === "m") { toggleMute(); wake(); }
      else if (k === "f") onFull();
      else if (k === "t") onTheater();
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  });

  const pct = dur ? Math.min(100, (t / dur) * 100) : 0;
  const VolIcon = muted || vol === 0 ? VolumeX : vol < 0.5 ? Volume1 : Volume2;
  const scrub = (e: { clientX: number; currentTarget: HTMLElement }) => { const r = e.currentTarget.getBoundingClientRect(); const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); return x * dur; };

  return (
    <>
      {/* the picture itself takes the clicks (the frame cannot: its own controls are off): click plays, double-click is fullscreen */}
      <div className={cn("absolute inset-0 z-[6]", hidden && "cursor-none")} onClick={() => { if (menu) { closeMenu(); return; } toggle(); wake(); }} onDoubleClick={onFull} aria-hidden />

      <SubtitleLayer video={clockRef as unknown as RefObject<HTMLVideoElement | null>} cues={subs.overlayOn ? subs.cues : []} offset={subs.offset} style={subStyle} preview={menu && page === "subs"} />

      {/* Cupcake broadcaster bug: the same soft watermark the anime player wears on our own server */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/cupcake.png" alt="" aria-hidden className={cn("pointer-events-none absolute left-3.5 top-3.5 z-[7] size-11 select-none drop-shadow-[0_2px_8px_rgba(0,0,0,.65)] transition-opacity duration-500", hidden ? "opacity-15" : "opacity-35")} />

      {ready && !playing && (
        <button type="button" onClick={() => { toggle(); wake(); }} aria-label="Play"
          className="absolute left-1/2 top-1/2 z-[8] grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-frost text-frost-ink shadow-[0_0_0_10px_rgb(var(--glow)/.25),0_20px_50px_-12px_rgba(0,0,0,.7)] transition hover:scale-105">
          <Play className="ml-1 size-8" fill="currentColor" />
        </button>
      )}
      {flash && <div className="pointer-events-none absolute left-1/2 top-1/2 z-[8] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-5 py-2.5 text-[15px] font-extrabold text-white backdrop-blur animate-in fade-in zoom-in-95">{flash}</div>}

      {menu && (
        <SettingsPanel
          sources={ZEUS_SERVERS.map((x): Source => ({ id: x.id, label: x.name, audio: "sub" }))} current={used ? { id: used, label: serverName(used), audio: "sub" } : undefined} dead={new Set()} failed={new Set()} onPick={(x) => pickServer(String(x.id))}
          speed={rate} onSpeed={pickRate}
          subs={tracks} caption={caption} onCaption={pickCaption}
          mineName={subs.mine?.name ?? null} onUpload={subs.uploadSubs} onRemoveMine={subs.removeMine}
          offset={subs.offset} onOffset={subs.setOffset} onAutoSync={() => {}} noAutoSync sync={subs.sync} hasCues={subs.cues.length > 0} onDownload={subs.downloadSubs}
          style={subStyle} onStyle={patchSubStyle} onResetStyle={resetSubStyle}
          autoNext={autoNext} onAutoNext={setAuto} stopAfter={stopAfter} onStopAfter={setStopAfter}
          sleepMin={sleepMin} onSleep={setSleepMin}
          page={page} onPage={setPage} onClose={closeMenu}
        />
      )}

      {/* controls */}
      <div className={cn("absolute inset-x-0 bottom-0 z-[9] bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-1.5 pt-14 transition-opacity duration-300 sm:px-4 sm:pb-3", hidden && "pointer-events-none opacity-0")} onClick={(e) => e.stopPropagation()}>
        <div
          className="group/seek relative mb-2 h-5 cursor-pointer touch-none"
          onPointerDown={(e) => { if (!dur) return; scrubbing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const v = scrub(e); setT(v); }}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); setHover({ x: x * 100, t: x * dur }); if (scrubbing.current && dur) setT(scrub(e)); }}
          onPointerUp={(e) => { if (scrubbing.current && dur) { seekTo(scrub(e)); } scrubbing.current = false; }}
          onPointerLeave={() => setHover(null)}
          role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)} tabIndex={-1}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/20 transition-all group-hover/seek:h-1.5">
            <div className="absolute inset-y-0 left-0 bg-frost" style={{ width: `${pct}%` }} />
          </div>
          <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-frost shadow-[0_0_0_4px_rgb(var(--glow)/.35)] opacity-0 transition group-hover/seek:opacity-100" style={{ left: `${pct}%` }} />
          {hover && dur > 0 && <div className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-lg bg-black/80 px-2 py-1 font-mono text-[11.5px] text-white" style={{ left: `${hover.x}%` }}>{clock(hover.t)}</div>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={bar} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5" fill="currentColor" />}</button>
          <button type="button" className={cn(bar, "relative")} onClick={() => seekBy(-10)} aria-label="Back 10 seconds" title="Back 10s (J)"><RotateCcw className="size-[19px]" /><span className="pointer-events-none absolute text-[7.5px] font-black leading-none">10</span></button>
          <button type="button" className={cn(bar, "relative")} onClick={() => seekBy(10)} aria-label="Forward 10 seconds" title="Forward 10s (L)"><RotateCw className="size-[19px]" /><span className="pointer-events-none absolute text-[7.5px] font-black leading-none">10</span></button>
          {prev && <button type="button" className={bar} onClick={() => router.push(prev.href)} aria-label="Previous episode" title={prev.label}><SkipBack className="size-[18px]" /></button>}
          {next && <button type="button" className={bar} onClick={() => router.push(next.href)} aria-label="Next episode" title={next.label}><SkipForward className="size-[18px]" /></button>}
          <div className="group/vol flex items-center">
            <button type="button" className={bar} onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}><VolIcon className="size-5" /></button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} aria-label="Volume" onChange={(e) => setVolume(Number(e.target.value))}
              className="w-0 accent-[var(--frost)] opacity-0 transition-all group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100" />
          </div>
          <span className="ml-2 font-mono text-[12.5px] tabular-nums text-white/85">{clock(t)} <span className="text-white/45">/ {clock(dur)}</span></span>
          <span className="flex-1" />
          <button type="button" className={cn(bar, caption != null && "text-frost")} onClick={() => { setPage("subs"); setMenu(true); }} aria-label="Subtitles" title="Subtitles"><Captions className="size-5" /></button>
          <button type="button" className={cn(bar, menu && "text-frost")} onClick={() => { if (menu) closeMenu(); else { setPage("main"); setMenu(true); } }} aria-label="Settings" aria-expanded={menu} title="Settings"><Settings className="size-5" /></button>
          <button type="button" className={cn(bar, "hidden md:grid", theater && "text-frost")} onClick={onTheater} aria-label="Theater mode" aria-pressed={theater} title="Theater (T)"><RectangleHorizontal className="size-5" /></button>
          <button type="button" className={bar} onClick={onFull} aria-label="Fullscreen" title="Fullscreen (F)">{full ? <Minimize className="size-5" /> : <Maximize className="size-5" />}</button>
          {next && <button type="button" onClick={() => router.push(next.href)} className="ml-1 hidden h-9 items-center gap-1 rounded-full bg-frost px-3.5 text-[12px] font-extrabold text-frost-ink sm:flex">{next.label}<ChevronRight className="size-4" /></button>}
        </div>
      </div>
    </>
  );
}
