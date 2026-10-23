"use client";
import type Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { MovieStream, MovieSource, MovieEmbed } from "@/lib/tmdb";

// Movie/series player. Two kinds of server:
//   • Cupcake — 8Stream's direct HLS for a movie, played in a native <video>
//     (real browser controls, fullscreen everywhere incl. iOS) through our own
//     proxy so no CORS/Referer check can block it.
//   • VidSrc / VidLink / … — TMDB-keyed iframe embeds. Instant and resilient
//     (the embed host handles the CDN), and the only option for TV episodes.
export function MoviePlayer({ stream, embeds = [], poster }: { stream: MovieStream | null; embeds?: MovieEmbed[]; poster?: string | null }) {
  const sources = stream?.sources ?? [];
  const subtitles = stream?.subtitles ?? [];
  const hasNative = sources.length > 0;
  // The direct 8Stream HLS leads when we have it (proxied, so it's reliable);
  // the embeds are the fallback the viewer can switch to.
  const servers = [...(hasNative ? [{ k: "cupcake", label: "Cupcake" }] : []), ...embeds.map((e) => ({ k: e.name, label: e.name }))];
  const [server, setServer] = useState<string>(servers[0]?.k ?? "cupcake");
  const curEmbed = embeds.find((e) => e.name === server) ?? null;
  const useEmbed = !!curEmbed;

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
    // One candidate per source: 8Stream's HLS (proxied through our origin) or an
    // embed. A watchdog advances if a source neither starts nor errors within a
    // few seconds, so a dead URL never stalls the player on a long timeout.
    const chain = [cur.url].filter(Boolean) as string[];
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

  if (!hasNative && !embeds.length) {
    return <div className="grid aspect-video w-full place-items-center rounded-[26px] border-1.5 border-night-line bg-night text-center text-[14px] font-semibold text-night-muted">This title isn’t playable right now. Try another.</div>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {useEmbed && curEmbed ? (
        <iframe key={curEmbed.url} src={curEmbed.url} title="Player" allowFullScreen referrerPolicy="origin"
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
          className="aspect-video w-full rounded-[26px] border-1.5 border-night-line bg-black" />
      ) : (
        <video ref={video} controls playsInline poster={poster ?? undefined}
          className="aspect-video w-full rounded-[26px] border-1.5 border-night-line bg-black shadow-[0_30px_60px_-30px_rgba(0,0,0,.9)]">
          {subtitles.map((t, i) => <track key={i} kind="subtitles" src={t.url} srcLang={t.lang} label={t.label} default={i === 0} />)}
        </video>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {servers.length > 1 && (
          <div className="mr-1 flex items-center gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-[.12em] text-plum-muted">Server</span>
            {servers.map((s) => (
              <button key={s.k} type="button" aria-pressed={server === s.k} onClick={() => setServer(s.k)}
                className={cn("h-8 rounded-full border-1.5 border-line bg-cream-card px-3 text-[12px] font-extrabold hover:border-frost-hot", server === s.k && "border-frost-hot bg-frost text-frost-ink")}>
                {s.label}
              </button>
            ))}
          </div>
        )}
        {!useEmbed && sources.length > 1 && (
          <>
            <span className="text-[11px] font-extrabold uppercase tracking-[.12em] text-plum-muted">Audio</span>
            {sources.map((s) => (
              <button key={s.label + s.url} type="button" aria-pressed={cur?.url === s.url} onClick={() => setCur(s)}
                className={cn("h-8 rounded-full border-1.5 border-line bg-cream-card px-3 text-[12px] font-extrabold hover:border-frost-hot", cur?.url === s.url && "border-frost-hot bg-frost text-frost-ink")}>
                {s.label}
              </button>
            ))}
          </>
        )}
      </div>
      {servers.length > 1 && (
        <p className="px-1 text-[11.5px] font-semibold text-plum-muted">Black screen or won’t play? Switch to another server above.</p>
      )}
    </div>
  );
}
