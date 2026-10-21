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
}

const AUDIO_LABELS: Record<VideoSource["audio"], string> = { sub: "Sub", dub: "Dub", raw: "Raw" };

/**
 * Plays an episode from one of its sources ("servers"). Playback URLs are
 * fetched from /api/play per source, so signed URLs never sit in the HTML.
 * If a source fails, the next one in priority order is tried.
 */
export function Player({ animeId, episodeKey, sources, subtitles, intro, outroStart, nextHref }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [current, setCurrent] = useState<VideoSource | undefined>(sources[0]);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [autoNext, setAutoNext] = useState(false);

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
    try {
      setAutoNext(localStorage.getItem("autoNext") === "1");
    } catch {
      // Storage unavailable (private mode); keep the default.
    }
  }, []);

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
        // Safari plays HLS natively.
        video.src = url;
      }
      if (resumeAt > 5) video.currentTime = resumeAt;
    })().catch(() => fallback(current));

    return () => {
      cancelled = true;
    };
  }, [current, fallback, progressKey]);

  useEffect(() => () => hlsRef.current?.destroy(), []);

  // Count one view per episode page load.
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
    setTime(video.currentTime);
    if (Math.floor(video.currentTime) % 5 === 0) {
      try {
        localStorage.setItem(progressKey, String(Math.floor(video.currentTime)));
      } catch {}
    }
  };

  const showSkipIntro =
    intro.start != null && intro.end != null && time >= intro.start && time < intro.end;
  const showSkipOutro = outroStart != null && nextHref != null && time >= outroStart;

  if (sources.length === 0) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-panel text-muted">
        No sources are available for this episode yet.
      </div>
    );
  }

  const audios = [...new Set(sources.map((s) => s.audio))];

  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          className="h-full w-full"
          onTimeUpdate={onTimeUpdate}
          onEnded={() => {
            try {
              localStorage.removeItem(progressKey);
            } catch {}
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

      <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg bg-panel p-3 text-sm">
        {audios.map((audio) => (
          <div key={audio} className="flex flex-wrap items-center gap-2">
            <span className="w-10 text-muted">{AUDIO_LABELS[audio]}</span>
            {sources
              .filter((s) => s.audio === audio)
              .map((s) => (
                <button
                  key={s.id}
                  onClick={() => setCurrent(s)}
                  disabled={failed.has(s.id)}
                  className={`rounded-md px-3 py-1 ${
                    s.id === current?.id ? "bg-accent text-black" : "bg-line hover:bg-line/70"
                  } disabled:opacity-40`}
                >
                  {s.label}
                </button>
              ))}
          </div>
        ))}
        <label className="ml-auto flex items-center gap-2 text-muted">
          <input
            type="checkbox"
            checked={autoNext}
            onChange={(e) => {
              setAutoNext(e.target.checked);
              try {
                localStorage.setItem("autoNext", e.target.checked ? "1" : "0");
              } catch {}
            }}
          />
          Auto next
        </label>
      </div>
    </div>
  );
}
