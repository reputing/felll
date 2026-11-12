"use client";
import type Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Captions } from "lucide-react";
import type { MovieStream, MovieSource, MovieEmbed } from "@/lib/tmdb";
import { SettingsPanel } from "@/components/watch/settings-panel";
import { SubtitleLayer, useSubStyle } from "@/components/watch/subtitles";
import { useNativeCues, useSubs } from "@/components/watch/use-subs";

// Movie/series player. Two kinds of server:
//   • Cupcake — 8Stream's direct HLS for a movie, played in a native <video>
//     (real browser controls, fullscreen everywhere incl. iOS) through our own
//     proxy so no CORS/Referer check can block it.
//   • VidSrc / VidLink / … — TMDB-keyed iframe embeds. Instant and resilient
//     (the embed host handles the CDN), and the only option for TV episodes.
// one array for the life of the page: a fresh `[]` each render made the subtitles hook re-run its effect on every render and
// loop ("Maximum update depth exceeded") until the tab slowed to a crawl
const NO_TRACKS: never[] = [];

export function MoviePlayer({ streamSrc, embeds = [], poster, subKey }: { streamSrc?: string | null; embeds?: MovieEmbed[]; poster?: string | null; subKey?: string }) {
  const subtitles: MovieStream["subtitles"] = []; // 8Stream carries no subtitles
  // The direct 8Stream sources resolve lazily (see effect below), so the page
  // never blocks on them. "Cupcake" is offered optimistically until proven dead.
  const [sources, setSources] = useState<MovieSource[] | null>(null); // null = not loaded yet
  const [nativeDead, setNativeDead] = useState(false);
  const hasNative = !!streamSrc && !nativeDead;
  const servers = [...(hasNative ? [{ k: "cupcake", label: "Zeus" }] : []), ...embeds.map((e) => ({ k: e.name, label: e.name }))];
  const [server, setServer] = useState<string>(streamSrc ? "cupcake" : embeds[0]?.name ?? "cupcake");
  const curEmbed = embeds.find((e) => e.name === server) ?? null;
  const useEmbed = !!curEmbed;

  const video = useRef<HTMLVideoElement>(null);
  const hls = useRef<Hls | null>(null);
  const [cur, setCur] = useState<MovieSource | undefined>(undefined);

  // Your own subtitles for this title (upload, timing, auto-sync, look). Shown over the picture;
  // inside the browser's own fullscreen/PiP, which our overlay can't reach, they ride a native track.
  const [caption, setCaption] = useState<string | number | null>(null);
  const [subStyle, patchSubStyle, resetSubStyle] = useSubStyle();
  const [subsOpen, setSubsOpen] = useState(false);
  const [native, setNative] = useState(false);
  const subs = useSubs({ video, subKey: subKey ?? "m:none", title: "movie", ep: null, tracks: NO_TRACKS, caption, setCaption });
  useEffect(() => { if (subs.mine) setCaption((c) => c ?? "mine"); }, [subs.mine]);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const upd = () => setNative(document.fullscreenElement === v || !!document.pictureInPictureElement || !!(v as HTMLVideoElement & { webkitDisplayingFullscreen?: boolean }).webkitDisplayingFullscreen);
    for (const ev of ["fullscreenchange", "webkitbeginfullscreen", "webkitendfullscreen", "enterpictureinpicture", "leavepictureinpicture"]) (ev.startsWith("fullscreen") ? document : v).addEventListener(ev, upd);
    return () => { for (const ev of ["fullscreenchange", "webkitbeginfullscreen", "webkitendfullscreen", "enterpictureinpicture", "leavepictureinpicture"]) (ev.startsWith("fullscreen") ? document : v).removeEventListener(ev, upd); };
  }, [useEmbed, cur]);
  useNativeCues(video, subs.cues, subs.offset, native && subs.overlayOn);

  // Resolve 8Stream's HLS only when the Cupcake server is actually in use.
  useEffect(() => {
    if (useEmbed || !streamSrc || sources !== null) return;
    let on = true;
    // 12 seconds is plenty for a warm backend; a cold one is not worth a viewer's wait when an embed server is one tap away
    fetch(streamSrc, { signal: AbortSignal.timeout(12000) }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!on) return;
      const got: MovieSource[] = (d?.sources ?? []).map((s: { label: string; url: string; format?: string; proxy?: string }) => ({ label: s.label, url: s.url, format: s.format === "hls" ? ("hls" as const) : ("mp4" as const), proxy: s.proxy }));
      setSources(got);
      if (got.length) setCur(got[0]);
      else { setNativeDead(true); if (embeds[0]) setServer(embeds[0].name); }
    }).catch(() => { if (on) { setNativeDead(true); if (embeds[0]) setServer(embeds[0].name); } });
    return () => { on = false; };
  }, [useEmbed, streamSrc, sources, embeds]);

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
    // The direct url first (played with no Referer: the watch page sets a no-referrer policy, which a video element cannot set for itself), then the same-origin proxy for a
    // CDN that insists on being asked a certain way. If both fail, hand over to the first embed server rather than
    // leaving a black box: that is what "find a fallback" means for a viewer who just pressed play.
    const chain = [cur.url, cur.proxy].filter(Boolean) as string[];
    let idx = 0;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const started = () => { clearTimeout(watchdog); };
    const advance = () => {
      if (cancelled) return;
      clearTimeout(watchdog);
      idx += 1;
      if (idx < chain.length) { play(idx); return; }
      if (embeds[0]) { setNativeDead(true); setServer(embeds[0].name); }
    };
    const play = (n: number) => {
      v.src = chain[n];
      v.load();
      clearTimeout(watchdog);
      watchdog = setTimeout(advance, n < chain.length - 1 ? 7000 : 15000);
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

  // Anti-redirect. A third-party frame can send the whole tab somewhere else once somebody has clicked inside it (that is
  // how most ad redirects work), and a sandbox that forbids it is not an option (every server refuses one). So while an
  // embed is on screen the browser is asked to confirm before the page unloads; a redirect the viewer did not ask for
  // shows the "leave this site?" prompt and Cancel keeps them on the page. Our own links are client-side navigations and
  // never trigger it.
  useEffect(() => {
    if (!useEmbed) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [useEmbed]);

  if (!hasNative && !embeds.length) {
    return <div className="grid aspect-video w-full place-items-center rounded-[26px] border-1.5 border-night-line bg-night text-center text-[14px] font-semibold text-night-muted">This title isn’t playable right now. Try another.</div>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {useEmbed && curEmbed ? (
        // No sandbox attribute, on purpose: tested in a browser, every one of these servers detects a sandboxed frame and
        // refuses to play ("Please Disable Sandbox"). `allow` is what lets them use fullscreen, autoplay and DRM.
        <iframe key={curEmbed.url} src={curEmbed.url} title="Player" allowFullScreen referrerPolicy="origin"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          className="aspect-video w-full rounded-[26px] border-1.5 border-night-line bg-black" />
      ) : (
        <div className="relative" data-settings>
          <video ref={video} controls playsInline poster={poster ?? undefined}
            className="aspect-video w-full rounded-[26px] border-1.5 border-night-line bg-black shadow-[0_30px_60px_-30px_rgba(0,0,0,.9)]">
            {subtitles.map((t, i) => <track key={i} kind="subtitles" src={t.url} srcLang={t.lang} label={t.label} default={i === 0} />)}
          </video>
          {subKey && !native && <SubtitleLayer video={video} cues={subs.overlayOn ? subs.cues : []} offset={subs.offset} style={subStyle} preview={subsOpen} />}
          {subKey && (
            <button type="button" onClick={() => setSubsOpen((o) => !o)} aria-label="Subtitles" aria-expanded={subsOpen}
              className="absolute right-3 top-3 z-10 flex h-9 items-center gap-1.5 rounded-full bg-black/60 px-3 text-[12.5px] font-extrabold text-white backdrop-blur hover:bg-black/80">
              <Captions className="size-4" />{subs.mine ? "Subtitles" : "Add subtitles"}
            </button>
          )}
          {subKey && subsOpen && (
            <SettingsPanel subsOnly page="subs" onPage={() => {}} onClose={() => setSubsOpen(false)}
              sources={[]} dead={new Set()} failed={new Set()} onPick={() => {}} speed={1} onSpeed={() => {}}
              subs={subs.mine ? [{ id: "mine", language: "und", label: `My file · ${subs.mine.name}`, url: "", is_default: 0 }] : []} caption={caption} onCaption={setCaption}
              mineName={subs.mine?.name ?? null} onUpload={subs.uploadSubs} onRemoveMine={subs.removeMine}
              offset={subs.offset} onOffset={subs.setOffset} onAutoSync={subs.autoSync} sync={subs.sync} hasCues={subs.cues.length > 0} onDownload={subs.downloadSubs}
              style={subStyle} onStyle={patchSubStyle} onResetStyle={resetSubStyle}
              autoNext={false} onAutoNext={() => {}} stopAfter={false} onStopAfter={() => {}} sleepMin={null} onSleep={() => {}} />
          )}
        </div>
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
        {!useEmbed && (sources?.length ?? 0) > 1 && (
          <>
            <span className="text-[11px] font-extrabold uppercase tracking-[.12em] text-plum-muted">Quality</span>
            {sources!.map((s) => (
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
