"use client";
import type Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { MovieStream, MovieSource } from "@/lib/movies";

// Movie/series player. Moviebox hands back direct MP4 sources per resolution
// (plus HLS manifests), so a native <video> with real browser controls is the
// robust choice — fullscreen works on every platform, including iOS. Quality and
// caption pickers sit above it.
export function MoviePlayer({ stream, poster }: { stream: MovieStream; poster?: string | null }) {
  const { sources, subtitles } = stream;
  const video = useRef<HTMLVideoElement>(null);
  const hls = useRef<Hls | null>(null);
  const [cur, setCur] = useState<MovieSource | undefined>(() => sources.find((s) => s.format !== "hls") ?? sources[0]);

  useEffect(() => {
    const v = video.current;
    if (!v || !cur) return;
    let cancelled = false;
    const at = v.currentTime;
    hls.current?.destroy();
    hls.current = null;
    // Ordered candidates for an MP4: the backend /proxy first — it fetches the
    // stream server-side with the real moviebox referer, so it's the reliable
    // path — then the signed CDN URL direct (played with no referer thanks to
    // the page's no-referrer policy) as a fallback. A watchdog advances if a
    // source neither starts nor errors within a few seconds, so a dead URL
    // never stalls the player on a long network timeout. HLS plays direct only.
    const chain = (cur.format === "hls" ? [cur.url] : [cur.proxy, cur.url]).filter(Boolean) as string[];
    let idx = 0;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const started = () => { clearTimeout(watchdog); };
    const advance = () => {
      if (cancelled) return;
      clearTimeout(watchdog);
      idx += 1;
      if (idx < chain.length) play(idx);
    };
    const play = (n: number) => {
      v.src = chain[n];
      v.load();
      clearTimeout(watchdog);
      if (n < chain.length - 1) watchdog = setTimeout(advance, 7000);
    };
    (async () => {
      if (cur.format === "hls" && !v.canPlayType("application/vnd.apple.mpegurl")) {
        const { default: HlsJs } = await import("hls.js");
        if (cancelled || !HlsJs.isSupported()) { v.src = cur.url; return; }
        const h = new HlsJs();
        hls.current = h;
        h.loadSource(cur.url);
        h.attachMedia(v);
      } else {
        play(0);
      }
      v.addEventListener("error", advance);
      v.addEventListener("loadeddata", started);
      v.addEventListener("playing", started);
      v.addEventListener("loadedmetadata", () => { if (at > 1) v.currentTime = at; }, { once: true });
    })().catch(() => { v.src = cur.url; });
    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      v.removeEventListener("error", advance);
      v.removeEventListener("loadeddata", started);
      v.removeEventListener("playing", started);
    };
  }, [cur]);

  useEffect(() => () => hls.current?.destroy(), []);

  if (!sources.length) {
    return <div className="grid aspect-video w-full place-items-center rounded-[26px] border-1.5 border-night-line bg-night text-center text-[14px] font-semibold text-night-muted">This title isn’t playable right now. Try another.</div>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <video ref={video} controls playsInline poster={poster ?? undefined}
        className="aspect-video w-full rounded-[26px] border-1.5 border-night-line bg-black shadow-[0_30px_60px_-30px_rgba(0,0,0,.9)]">
        {subtitles.map((t, i) => <track key={i} kind="subtitles" src={t.url} srcLang={t.lang} label={t.label} default={i === 0} />)}
      </video>
      {sources.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-[.12em] text-plum-muted">Quality</span>
          {sources.map((s) => (
            <button key={s.res + s.url} type="button" aria-pressed={cur?.url === s.url} onClick={() => setCur(s)}
              className={cn("h-8 rounded-full border-1.5 border-line bg-cream-card px-3 text-[12px] font-extrabold hover:border-frost-hot", cur?.url === s.url && "border-frost-hot bg-frost text-frost-ink")}>
              {s.res}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
