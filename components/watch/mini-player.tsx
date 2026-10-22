"use client";
import type Hls from "hls.js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Maximize2, Pause, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { setMini, useBox, type NowPlaying } from "@/lib/store";
import { Poster } from "@/components/poster";

// A floating, keep-playing player. The watch page's inline <Player> publishes
// what's playing into the store; when you navigate off the watch page it
// unmounts, and this picks the stream back up where you left it so sound keeps
// going. Back on a watch page, the inline player takes over again and this hides.
export function MiniPlayer() {
  const mini = useBox((s) => s.mini);
  const pathname = usePathname();
  const onWatch = !!pathname?.startsWith("/watch/");
  const active = !!mini && !onWatch;

  if (!active) return null;
  return <Mini key={mini.sourceId} initial={mini} />;
}

function Mini({ initial }: { initial: NowPlaying }) {
  // Live state for the labels; the snapshot drives the one-time stream load.
  const mini = useBox((s) => s.mini) ?? initial;
  const video = useRef<HTMLVideoElement>(null);
  const hls = useRef<Hls | null>(null);
  const lastSent = useRef(0);
  const [playing, setPlaying] = useState(!initial.paused);
  const [ready, setReady] = useState(false);
  const start = useRef({ sourceId: initial.sourceId, position: initial.position, autoplay: !initial.paused });

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let cancelled = false;
    const resumeAt = start.current.position;
    (async () => {
      const res = await fetch(`/api/play/${start.current.sourceId}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { url: string };
      hls.current?.destroy();
      hls.current = null;
      if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = data.url;
      } else {
        const { default: HlsJs } = await import("hls.js");
        if (cancelled || !HlsJs.isSupported()) return;
        const h = new HlsJs({ capLevelToPlayerSize: true, startPosition: resumeAt > 5 ? resumeAt : -1 });
        hls.current = h;
        h.loadSource(data.url);
        h.attachMedia(v);
      }
      const seek = () => { if (resumeAt > 5 && Math.abs(v.currentTime - resumeAt) > 2) v.currentTime = resumeAt; };
      v.addEventListener("loadedmetadata", seek, { once: true });
      setReady(true);
      if (start.current.autoplay) v.play().catch(() => {});
    })().catch(() => {});
    return () => { cancelled = true; hls.current?.destroy(); hls.current = null; };
  }, []);

  const report = (force = false) => {
    const v = video.current;
    if (!v || !v.duration) return;
    const now = Date.now();
    if (!force && now - lastSent.current < 15_000) return;
    lastSent.current = now;
    setMini({ position: v.currentTime, paused: v.paused });
    fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        malId: mini.malId, ep: mini.ep, title: mini.title, image: mini.image,
        episodes: mini.episodes, format: mini.format, position: v.currentTime, duration: v.duration, start: false,
      }),
    }).catch(() => {});
  };

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  };
  const close = () => { report(true); setMini(null); };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-1.5 border-night-line bg-black shadow-[0_24px_48px_-20px_rgba(0,0,0,.8)] animate-in slide-in-from-bottom-4 fade-in">
      <div className="group relative aspect-video">
        {!ready && mini.image && <Poster src={mini.image} className="absolute inset-0 size-full opacity-40" />}
        <video
          ref={video}
          playsInline
          className="size-full bg-black"
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => { setPlaying(false); report(true); }}
          onTimeUpdate={() => report()}
          onEnded={() => setMini(null)}
          crossOrigin="anonymous"
        />
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/30 opacity-0 transition group-hover:opacity-100">
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"}
            className="grid size-11 place-items-center rounded-full bg-frost text-frost-ink shadow-press transition hover:scale-105">
            {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="ml-0.5 size-5" fill="currentColor" />}
          </button>
        </div>
        <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <Link href={mini.href} aria-label="Back to full player"
            className="grid size-7 place-items-center rounded-full bg-black/60 text-white/90 backdrop-blur hover:bg-black/80 hover:text-white">
            <Maximize2 className="size-3.5" />
          </Link>
          <button type="button" onClick={close} aria-label="Close mini player"
            className="grid size-7 place-items-center rounded-full bg-black/60 text-white/90 backdrop-blur hover:bg-black/80 hover:text-white">
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <Link href={mini.href} className="flex items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-extrabold text-white">{mini.title}</span>
          <span className="text-[11px] font-semibold text-white/55">Episode {mini.ep}</span>
        </span>
      </Link>
    </div>
  );
}
