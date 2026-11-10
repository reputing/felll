"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Music2, Pause, Play, Search, SkipBack, SkipForward, Volume2, X } from "lucide-react";
import { activeLine, clock, musicLyrics, safeArt, searchMusic, streamUrl, type Lyrics, type MusicTrack } from "@/lib/music";
import { cn } from "@/lib/utils";

// The music player, for listening while you watch. It lives in the members layout, which stays mounted as
// you move between pages, so the one <audio> element keeps playing across the site (including from one
// episode to the next). Search the catalog, build a queue, follow synced lyrics. The queue and volume are
// remembered on this device; playback itself never starts until you press play.

const KEY = "cupcake:music";
interface Saved { queue: MusicTrack[]; at: number; vol: number }

let audioEl: HTMLAudioElement | null = null;
const audio = () => (audioEl ??= Object.assign(new Audio(), { preload: "none" }));

export function MusicPlayer() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [hits, setHits] = useState<MusicTrack[]>([]);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [at, setAt] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [ms, setMs] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(0.7);
  const [lyr, setLyr] = useState<Lyrics | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [ready, setReady] = useState(false);
  const queueLen = useRef(0); queueLen.current = queue.length;
  const atRef = useRef(-1); atRef.current = at;
  const startNext = useRef(false); // the next track that loads should start playing
  const lineRef = useRef<HTMLButtonElement>(null);
  const retried = useRef<string>("");
  const track = at >= 0 ? queue[at] ?? null : null;

  // restore what you had queued (paused)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null") as Saved | null;
      if (s) { setQueue(Array.isArray(s.queue) ? s.queue.slice(0, 60) : []); setAt(typeof s.at === "number" ? s.at : -1); if (typeof s.vol === "number") setVol(s.vol); }
    } catch { /* storage off */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify({ queue, at, vol } satisfies Saved)); } catch { /* */ }
  }, [queue, at, vol, ready]);

  // the single audio element and its events
  useEffect(() => {
    const a = audio();
    const on = (ev: string, fn: () => void) => { a.addEventListener(ev, fn); return () => a.removeEventListener(ev, fn); };
    const offs = [
      on("timeupdate", () => setMs(a.currentTime * 1000)),
      on("loadedmetadata", () => setDur((a.duration || 0) * 1000)),
      on("play", () => setPlaying(true)),
      on("pause", () => setPlaying(false)),
      on("ended", () => { if (atRef.current >= 0 && atRef.current < queueLen.current - 1) { startNext.current = true; setAt(atRef.current + 1); } }),
      // a signed link that has expired: ask for a fresh one once, then give up quietly
      on("error", () => { const id = a.dataset.id || ""; if (id && retried.current !== id) { retried.current = id; a.src = streamUrl(id); a.play().catch(() => {}); } else setErr("that track won't play, try another"); }),
    ];
    setPlaying(!a.paused);
    return () => offs.forEach((f) => f());
  }, []);
  useEffect(() => { audio().volume = vol; }, [vol]);

  // load the track when it changes (play it only if something was already playing or you picked it)
  useEffect(() => {
    const a = audio();
    setLyr(null); setErr("");
    if (!track) return;
    if (a.dataset.id !== track.id) {
      a.dataset.id = track.id; retried.current = "";
      a.src = streamUrl(track.id);
      if (startNext.current) a.play().catch(() => setPlaying(false));
    }
    startNext.current = false;
    let alive = true;
    musicLyrics(track.id).then((r) => { if (alive && r.data) setLyr(r.data); });
    return () => { alive = false; };
  }, [track?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = lyr?.lines ?? [];
  const active = lines.length ? activeLine(lines, ms) : -1;
  // follow the lyric inside its own box (scrollIntoView would scroll the whole panel too)
  const lyricsBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = lyricsBox.current, el = lineRef.current;
    if (open && showLyrics && box && el && active >= 0) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [active, open, showLyrics]);

  const search = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const term = q.trim(); if (!term || busy) return;
    setBusy(true); setErr("");
    const r = await searchMusic(term);
    setBusy(false);
    if (r.error) { setErr(r.error); setHits([]); return; }
    setHits(r.data?.items ?? []);
    if (!(r.data?.items ?? []).length) setErr("nothing found for that");
  }, [q, busy]);

  const play = (t: MusicTrack) => {
    startNext.current = true;
    setQueue((qq) => {
      const i = qq.findIndex((x) => x.id === t.id);
      if (i >= 0) { setAt(i); return qq; }
      const next = [...qq, t].slice(-60);
      setAt(next.length - 1); return next;
    });
  };
  const add = (t: MusicTrack) => setQueue((qq) => (qq.some((x) => x.id === t.id) ? qq : [...qq, t].slice(-60)));
  const toggle = () => {
    const a = audio();
    if (!track) return;
    if (!a.src || a.dataset.id !== track.id) { a.dataset.id = track.id; a.src = streamUrl(track.id); }
    if (a.paused) a.play().catch(() => setErr("press play again to start")); else a.pause();
  };
  const seek = (to: number) => { const a = audio(); if (!dur) return; a.currentTime = to / 1000; setMs(to); };
  const step = (d: number) => { startNext.current = !audio().paused; setAt((i) => Math.max(0, Math.min(queue.length - 1, i + d))); };
  const remove = (i: number) => { setQueue((qq) => qq.filter((_, j) => j !== i)); setAt((a) => (i < a ? a - 1 : i === a ? -1 : a)); if (i === at) audio().pause(); };

  const art = (t: MusicTrack | null) => safeArt(t?.artwork?.small || t?.artwork?.large);
  const cover = (t: MusicTrack | null, size: string) => (
    <span className={cn("grid flex-none place-items-center overflow-hidden rounded-xl bg-cream-tint text-plum-muted", size)} style={art(t) ? { backgroundImage: `url(${art(t)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
      {!art(t) && <Music2 className="size-4" />}
    </span>
  );

  // a one-time nudge so the player is easy to find
  const [hint, setHint] = useState(false);
  useEffect(() => { try { if (!localStorage.getItem("cupcake:music-hint")) setHint(true); } catch { /* */ } }, []);
  const dismissHint = () => { setHint(false); try { localStorage.setItem("cupcake:music-hint", "1"); } catch { /* */ } };

  // collapsed: a small pill. Nothing queued: just the note.
  if (!open) {
    return (
      <div className="fixed bottom-4 left-4 z-40 sm:bottom-6 sm:left-6">
        {hint && !track && (
          <button type="button" onClick={() => { dismissHint(); setOpen(true); }} className="mb-2 block max-w-[220px] rounded-2xl border-1.5 border-frost-hot bg-cream-card px-3.5 py-2 text-left text-[12.5px] font-bold shadow-halo animate-in fade-in slide-in-from-bottom-2">
            ♪ Listen to music while you watch. <span className="text-frost-text">Open the player</span>
          </button>
        )}
        <div className={cn("flex items-center gap-1 rounded-full border-1.5 bg-cream-card p-1 shadow-halo", playing ? "border-frost-hot" : "border-line")}>
          <button type="button" onClick={() => { dismissHint(); setOpen(true); }} aria-label="Open music player" className="flex h-10 min-w-10 items-center gap-2 rounded-full pl-1 pr-3 text-left hover:bg-cream-tint">
            {track ? cover(track, "size-8") : <span className="grid size-8 place-items-center text-frost-text"><Music2 className="size-[18px]" /></span>}
            {playing && <span aria-hidden className="flex h-4 items-end gap-[2px]">{[0, 1, 2].map((i) => <span key={i} className="w-[3px] rounded-full bg-frost-hot animate-pulse" style={{ height: `${40 + ((i * 37) % 60)}%`, animationDelay: `${i * 160}ms` }} />)}</span>}
            {track && <span className="hidden max-w-[150px] min-w-0 sm:block"><span className="block truncate text-[12.5px] font-extrabold leading-tight">{track.title}</span><span className="block truncate text-[11px] font-semibold text-plum-muted">{track.artist}</span></span>}
            {!track && <span className="text-[12.5px] font-extrabold text-frost-text">Music</span>}
          </button>
          {track && (
            <button type="button" onClick={toggle} aria-label={playing ? "Pause music" : "Play music"} className="grid size-10 place-items-center rounded-full bg-frost text-frost-ink">
              {playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div role="dialog" aria-label="Music player" className="fixed bottom-4 left-4 z-40 flex max-h-[min(640px,calc(100svh-2rem))] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-box border-1.5 border-line bg-cream-card shadow-halo animate-in fade-in slide-in-from-bottom-3 sm:bottom-6 sm:left-6">
      <div className="flex items-center gap-2 border-b-1.5 border-line-soft px-4 py-3">
        <Music2 className="size-4 text-frost-hot" /><span className="flex-1 text-[14px] font-extrabold">Music</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Minimise" className="grid size-8 place-items-center rounded-full hover:bg-cream-tint"><ChevronDown className="size-4" /></button>
      </div>

      <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <form onSubmit={search} className="relative">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-plum-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search songs and artists" aria-label="Search music"
            className="h-10 w-full rounded-full border-1.5 border-line bg-paper pl-10 pr-4 text-[13.5px] font-semibold outline-none focus:border-frost-hot" />
        </form>
        {err && <p className="px-1 text-[12.5px] font-bold text-red-500">{err}</p>}
        {busy && <p className="px-1 text-[12.5px] font-semibold text-plum-muted">searching…</p>}

        {hits.length > 0 && (
          <ul className="flex flex-col gap-1">
            {hits.map((t) => (
              <li key={t.id} className="flex items-center gap-1">
                <button type="button" onClick={() => play(t)} className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 text-left hover:bg-cream-tint", track?.id === t.id && "bg-cream-blush")}>
                  {cover(t, "size-9")}
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-extrabold">{t.title}</span><span className="block truncate text-[11.5px] font-semibold text-plum-muted">{t.artist}</span></span>
                  {!!t.duration_ms && <span className="font-mono text-[11px] text-plum-muted">{clock(t.duration_ms)}</span>}
                </button>
                <button type="button" onClick={() => add(t)} aria-label={`Add ${t.title} to the queue`} title="add to queue" className="grid size-8 flex-none place-items-center rounded-full text-[18px] font-bold text-plum-muted hover:bg-cream-tint">+</button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col items-center gap-2 rounded-2xl bg-paper p-3">
          {cover(track, "size-24 !rounded-2xl")}
          <div className="w-full text-center">
            <div className="truncate text-[14px] font-extrabold">{track ? track.title : "nothing playing"}</div>
            <div className="truncate text-[12px] font-semibold text-plum-muted">{track ? track.artist : "search and pick a song"}</div>
          </div>
          <div className="w-full">
            <div className="group/seek h-4 cursor-pointer py-1.5" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur); }} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur / 1000)} aria-valuenow={Math.round(ms / 1000)}>
              <div className="h-1 overflow-hidden rounded-full bg-cream-tint"><div className="h-full rounded-full bg-frost-hot" style={{ width: `${dur ? Math.min(100, (ms / dur) * 100) : 0}%` }} /></div>
            </div>
            <div className="flex justify-between font-mono text-[11px] text-plum-muted"><span>{clock(ms)}</span><span>{clock(dur || track?.duration_ms || 0)}</span></div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => step(-1)} disabled={at <= 0} aria-label="Previous" className="grid size-9 place-items-center rounded-full hover:bg-cream-tint disabled:opacity-30"><SkipBack className="size-4" /></button>
            <button type="button" onClick={toggle} disabled={!track} aria-label={playing ? "Pause" : "Play"} className="grid size-11 place-items-center rounded-full bg-frost text-frost-ink disabled:opacity-40">{playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="ml-0.5 size-5" fill="currentColor" />}</button>
            <button type="button" onClick={() => step(1)} disabled={at < 0 || at >= queue.length - 1} aria-label="Next" className="grid size-9 place-items-center rounded-full hover:bg-cream-tint disabled:opacity-30"><SkipForward className="size-4" /></button>
          </div>
          <label className="flex w-full items-center gap-2 text-plum-muted"><Volume2 className="size-4 flex-none" /><input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(Number(e.target.value))} aria-label="Music volume" className="h-1 flex-1 accent-[var(--frost)]" /></label>
        </div>

        {track && (
          <div>
            <button type="button" onClick={() => setShowLyrics((s) => !s)} aria-expanded={showLyrics} className="text-[12px] font-extrabold uppercase tracking-[.1em] text-frost-text">{showLyrics ? "hide lyrics" : "show lyrics"}</button>
            {showLyrics && (
              <div ref={lyricsBox} className="scrollbar-none relative mt-2 max-h-[180px] overflow-y-auto rounded-2xl bg-paper p-2">
                {!lines.length ? <p className="p-2 text-[12.5px] font-semibold text-plum-muted">{lyr?.plain_text ? lyr.plain_text : "no lyrics for this one."}</p>
                  : lines.map((l, i) => <button key={i} type="button" ref={i === active ? lineRef : undefined} onClick={() => seek(l.start_ms)} className={cn("block w-full rounded-lg px-2 py-1 text-left text-[13.5px] leading-snug", i === active ? "font-extrabold text-plum" : "font-semibold text-plum-muted hover:bg-cream-tint")}>{l.text || "♪"}</button>)}
              </div>
            )}
          </div>
        )}

        {queue.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] font-extrabold uppercase tracking-[.1em] text-plum-muted">queue · {queue.length}</div>
            <ul className="flex flex-col gap-0.5">
              {queue.map((t, i) => (
                <li key={t.id} className="flex items-center gap-1">
                  <button type="button" onClick={() => { startNext.current = true; setAt(i); }} className="min-w-0 flex-1 rounded-lg px-2 py-1 text-left hover:bg-cream-tint"><span className={cn("block truncate text-[12.5px] font-extrabold", i === at && "text-frost-text")}>{t.title}</span><span className="block truncate text-[11px] font-semibold text-plum-muted">{t.artist}</span></button>
                  <button type="button" onClick={() => remove(i)} aria-label={`Remove ${t.title}`} className="grid size-7 flex-none place-items-center rounded-full text-plum-muted hover:bg-cream-tint"><X className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
