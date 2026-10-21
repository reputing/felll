"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Subtitle, VideoSource } from "@/lib/types";

interface Props {
  animeId: number;
  episodeKey: string;
  sources: VideoSource[];
  subtitles: Subtitle[];
  intro: { start: number | null; end: number | null };
  outroStart: number | null;
  nextHref: string | null;
  defaultAudio?: string;
}

const AUDIO_LABELS: Record<VideoSource["audio"], string> = { sub: "SUB", dub: "DUB", raw: "RAW" };

function usePref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [val, setVal] = useState(fallback);
  useEffect(() => {
    try { setVal(localStorage.getItem(key) === "1"); } catch {}
  }, [key]);
  const set = useCallback((v: boolean) => {
    setVal(v);
    try { localStorage.setItem(key, v ? "1" : "0"); } catch {}
  }, [key]);
  return [val, set];
}

export function Player({ animeId, episodeKey, sources, subtitles, intro, outroStart, nextHref, defaultAudio }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [current, setCurrent] = useState<VideoSource | undefined>(() => {
    if (defaultAudio) {
      const match = sources.find((s) => s.audio === defaultAudio);
      if (match) return match;
    }
    return sources[0];
  });
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [theater, setTheater] = usePref("theater", false);
  const [autoNext, setAutoNext] = usePref("autoNext", false);
  const [autoPlay, setAutoPlay] = usePref("autoPlay", true);
  const [autoSkip, setAutoSkip] = usePref("autoSkip", false);
  const [showKeys, setShowKeys] = useState(false);

  const progressKey = `progress:${episodeKey}`;

  const fallback = useCallback(
    (source: VideoSource) => {
      setFailed((prev) => {
        const next = new Set(prev).add(source.id);
        const candidate = sources.find((s) => !next.has(s.id));
        if (candidate) setCurrent(candidate);
        else setError("This episode could not be played. Please try again later.");
        return next;
      });
    },
    [sources],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !current) return;
    let cancelled = false;
    setError(null);

    (async () => {
      const res = await fetch(`/api/play/${current.id}`);
      if (!res.ok) return fallback(current);
      const { url } = (await res.json()) as { url: string };
      if (cancelled) return;

      let resumeAt = 0;
      try {
        resumeAt = Number(localStorage.getItem(progressKey)) || 0;
      } catch {}

      hlsRef.current?.destroy();
      if (Hls.isSupported()) {
        const hls = new Hls({ capLevelToPlayerSize: true });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            hls.destroy();
            fallback(current);
          }
        });
        hls.loadSource(url);
        hls.attachMedia(video);
      } else {
        video.src = url;
      }
      if (resumeAt > 5) video.currentTime = resumeAt;
      if (autoPlay) video.play().catch(() => {});
    })().catch(() => fallback(current));

    return () => { cancelled = true; };
  }, [current, fallback, progressKey, autoPlay]);

  useEffect(() => () => hlsRef.current?.destroy(), []);

  useEffect(() => {
    fetch("/api/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ animeId }),
    }).catch(() => {});
  }, [animeId, episodeKey]);

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const t = video.currentTime;
    setTime(t);
    if (Math.floor(t) % 5 === 0) {
      try { localStorage.setItem(progressKey, String(Math.floor(t))); } catch {}
    }
    if (autoSkip && intro.start != null && intro.end != null && t >= intro.start && t < intro.end) {
      video.currentTime = intro.end;
    }
    if (autoSkip && outroStart != null && nextHref && t >= outroStart) {
      window.location.href = nextHref;
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          video.paused ? video.play() : video.pause();
          break;
        case "f":
          e.preventDefault();
          document.fullscreenElement ? document.exitFullscreen() : video.requestFullscreen?.();
          break;
        case "m":
          e.preventDefault();
          video.muted = !video.muted;
          break;
        case "ArrowLeft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case "ArrowRight":
          e.preventDefault();
          video.currentTime += 10;
          break;
        case "ArrowUp":
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          break;
        case "t":
          e.preventDefault();
          setTheater(!theater);
          break;
        case "n":
          if (nextHref) {
            e.preventDefault();
            window.location.href = nextHref;
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nextHref, setTheater]);

  const showSkipIntro = !autoSkip && intro.start != null && intro.end != null && time >= intro.start && time < intro.end;
  const showSkipOutro = !autoSkip && outroStart != null && nextHref != null && time >= outroStart;

  if (sources.length === 0) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-panel text-muted">
        No sources are available for this episode yet.
      </div>
    );
  }

  const audios = [...new Set(sources.map((s) => s.audio))];

  return (
    <div data-theater={theater || undefined}>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          className="h-full w-full"
          onTimeUpdate={onTimeUpdate}
          onEnded={() => {
            try { localStorage.removeItem(progressKey); } catch {}
            if (autoNext && nextHref) window.location.href = nextHref;
          }}
        >
          {subtitles.map((s) => (
            <track key={s.id} kind="subtitles" src={s.url} srcLang={s.language} label={s.label} default={s.is_default} />
          ))}
        </video>
        {showSkipIntro && (
          <button
            onClick={() => videoRef.current && (videoRef.current.currentTime = intro.end!)}
            className="absolute bottom-16 right-4 rounded-md bg-white/90 px-3 py-1.5 text-sm font-semibold text-black"
          >
            Skip intro
          </button>
        )}
        {showSkipOutro && (
          <a
            href={nextHref!}
            className="absolute bottom-16 right-4 rounded-md bg-white/90 px-3 py-1.5 text-sm font-semibold text-black"
          >
            Next episode
          </a>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center">
            {error}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-panel p-3 text-sm">
        {/* Server buttons grouped by audio */}
        {audios.map((audio) => (
          <div key={audio} className="flex flex-wrap items-center gap-2">
            <span className="min-w-[40px] text-xs font-bold tracking-wider text-muted">{AUDIO_LABELS[audio]}:</span>
            <div className="flex items-center gap-1 rounded-lg bg-black/40 p-1 ring-1 ring-white/5">
              {sources
                .filter((s) => s.audio === audio)
                .map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setCurrent(s)}
                    disabled={failed.has(s.id)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                      s.id === current?.id ? "bg-accent text-black shadow-md" : "text-zinc-400 hover:bg-white/10 hover:text-white"
                    } disabled:opacity-40`}
                  >
                    {s.label}
                  </button>
                ))}
            </div>
          </div>
        ))}

        {/* Divider */}
        <div className="hidden h-6 w-px bg-line sm:block" />

        {/* Feature toggles */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ToggleBtn label="Theater" active={theater} onToggle={() => setTheater(!theater)} />
          <ToggleBtn label="Auto Play" active={autoPlay} onToggle={() => setAutoPlay(!autoPlay)} />
          <ToggleBtn label="Auto Next" active={autoNext} onToggle={() => setAutoNext(!autoNext)} />
          <ToggleBtn label="Auto Skip" active={autoSkip} onToggle={() => setAutoSkip(!autoSkip)} />
          <button
            onClick={() => setShowKeys(!showKeys)}
            className="rounded-md bg-line/60 px-2 py-1 text-xs text-muted hover:text-white"
          >
            Keys
          </button>
        </div>
      </div>

      {showKeys && (
        <div className="mt-2 rounded-lg bg-panel p-3 text-xs text-muted">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            <span><kbd className="rounded bg-line px-1">Space</kbd> / <kbd className="rounded bg-line px-1">K</kbd> Play/Pause</span>
            <span><kbd className="rounded bg-line px-1">F</kbd> Fullscreen</span>
            <span><kbd className="rounded bg-line px-1">M</kbd> Mute</span>
            <span><kbd className="rounded bg-line px-1">←</kbd> / <kbd className="rounded bg-line px-1">→</kbd> Seek ±10s</span>
            <span><kbd className="rounded bg-line px-1">↑</kbd> / <kbd className="rounded bg-line px-1">↓</kbd> Volume</span>
            <span><kbd className="rounded bg-line px-1">T</kbd> Theater</span>
            <span><kbd className="rounded bg-line px-1">N</kbd> Next episode</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleBtn({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`rounded-md px-2 py-1 text-xs transition ${
        active ? "bg-accent/20 text-accent" : "bg-line/60 text-muted hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}
