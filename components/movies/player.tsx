"use client";
import type Hls from "hls.js";
import { usePathname, useRouter } from "next/navigation";
import { ZeusControls, ZEUS_SERVERS, type Prefs } from "@/components/movies/zeus-controls";
import type { Source } from "@/components/watch/player";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, Loader2, Maximize, Minimize, RectangleHorizontal, RotateCw } from "lucide-react";
import type { MovieSource, MovieEmbed } from "@/lib/tmdb";

// Movie/series player. Two kinds of server:
//   • Cupcake — 8Stream's direct HLS for a movie, played in a native <video>
//     (real browser controls, fullscreen everywhere incl. iOS) through our own
//     proxy so no CORS/Referer check can block it.
//   • VidSrc / VidLink / … — TMDB-keyed iframe embeds. Instant and resilient
//     (the embed host handles the CDN), and the only option for TV episodes.
/** What the player reports back so "continue watching" and the history know where you are. */
export interface PlayTrack { tmdb?: number; imdb: string; media: "movie" | "tv"; season?: number; episode?: number; title: string; poster: string | null; year: number | null; epTitle?: string | null; episodes?: number | null; resume?: number }

const mmss = (s: number) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`; };

export function MoviePlayer({ streamSrc, embeds = [], poster, subKey, track, next, prev, trailer, knownMissing }: { streamSrc?: string | null; embeds?: MovieEmbed[]; poster?: string | null; subKey?: string; track?: PlayTrack; next?: { href: string; label: string }; prev?: { href: string; label: string }; trailer?: string | null; knownMissing?: boolean }) {
  // The direct 8Stream sources resolve lazily (see effect below), so the page
  // never blocks on them. "Cupcake" is offered optimistically until proven dead.
  const [sources, setSources] = useState<MovieSource[] | null>(null); // null = not loaded yet
  const [nativeDead, setNativeDead] = useState(false);
  const hasNative = !!streamSrc;
  const servers = [...(hasNative ? [{ k: "cupcake", label: "Iris", third: false }] : []), ...embeds.map((e) => ({ k: e.name, label: e.name, third: true }))];
  const [server, setServer] = useState<string>(streamSrc ? "cupcake" : embeds[0]?.name ?? "cupcake");
  const curEmbed = embeds.find((e) => e.name === server) ?? null;
  // A third-party player is never loaded on its own: they are the ones that open ad tabs and redirects, and no sandbox can
  // stop that (they refuse to play in one). Zeus, our own player, is the default; an embed only loads after the viewer
  // has been told what it is and said yes, and that choice is remembered for the rest of the visit.
  const [ok, setOk] = useState(false);
  // a server that plays inside a sandbox (Zeus) is safe to load straight away; anything else asks first
  const askEmbed = !!curEmbed && !curEmbed.sandbox && !ok;
  const useEmbed = !!curEmbed && (!!curEmbed.sandbox || ok);
  const router = useRouter();
  const pathname = usePathname();
  // the frame's look: a spinner over the poster until the player says it is ready (like the anime player's loader), theater
  // mode, and the "Up next" countdown when an episode ends
  const [ready, setReady] = useState(false);
  const [theater, setTheater] = useState(false);
  const [full, setFull] = useState(false);
  const [reloads, setReloads] = useState(0);
  // CineSrc says nothing at all when it cannot find a title (no error event; it stays on its own "Fetching media" screen), so "it
  // never said ready" is the only signal. After 25 seconds we stop pretending and offer another server.
  const [alive, setAlive] = useState(false);
  const [stuck, setStuck] = useState(false);
  // Members who already hit this title not starting made the page stop auto-loading it; "try anyway" loads it regardless.
  const [tryAnyway, setTryAnyway] = useState(false);
  // When the player gives up, count it (once per title per visit), so a title nobody can play is noticed. Only the title id is sent.
  const reported = useRef("");
  useEffect(() => {
    if (!stuck || !track) return;
    const k = `${track.imdb}:${track.season ?? 0}:${track.episode ?? 0}`;
    if (reported.current === k) return;
    reported.current = k;
    void fetch("/api/movie/missing", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ imdb: track.imdb, season: track.season ?? 0, episode: track.episode ?? 0 }) }).catch(() => {});
  }, [stuck, track?.imdb, track?.season, track?.episode]); // eslint-disable-line react-hooks/exhaustive-deps
  // switching server reloads the frame on that server at the spot you are at; CineSrc takes both as options (lastserver, t)
  const [pick, setPick] = useState<{ server: string; at: number } | null>(null);
  const prefs = useRef<Prefs>({ autoNext: true, stopAfter: false });
  const [nextIn, setNextIn] = useState<number | null>(null);
  const nextDismissed = useRef(false);
  const frameUrl = (() => {
    if (!curEmbed) return "";
    if (!pick) return curEmbed.url;
    const u = new URL(curEmbed.url);
    u.searchParams.set("lastserver", pick.server); u.searchParams.set("prioritize", "true");
    if (pick.at > 5) u.searchParams.set("t", String(Math.floor(pick.at)));
    return u.toString();
  })();
  useEffect(() => { setReady(false); setNextIn(null); nextDismissed.current = false; setAlive(false); setStuck(false); }, [frameUrl, reloads]);
  useEffect(() => {
    if (!curEmbed?.sandbox || alive) return;
    const t = setTimeout(() => setStuck(true), 25_000);
    return () => clearTimeout(t);
  }, [frameUrl, reloads, alive, curEmbed?.sandbox]);
  useEffect(() => { const t = setTimeout(() => setReady(true), 7000); return () => clearTimeout(t); }, [frameUrl, reloads]); // never hide a working player behind a spinner
  useEffect(() => { const on = () => setFull(!!document.fullscreenElement); document.addEventListener("fullscreenchange", on); return () => document.removeEventListener("fullscreenchange", on); }, []);
  useEffect(() => {
    if (nextIn == null) return;
    if (nextIn <= 0) { if (next) router.push(next.href); return; }
    const t = setTimeout(() => setNextIn((n) => (n == null ? n : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [nextIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const goFull = () => { const el = box.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.().catch(() => {}); };

  // --- progress: tell the server where we are, at most every 15 seconds (and when paused or finished) -----------------
  const sent = useRef({ at: 0, pos: 0 });
  const trackRef = useRef(track);
  useEffect(() => { trackRef.current = track; }, [track]);
  const report = (pos: number, dur: number, force = false) => {
    const t = trackRef.current;
    if (!t) return;
    const now = Date.now();
    if (!force && (now - sent.current.at < 15_000 || Math.abs(pos - sent.current.pos) < 5)) return;
    sent.current = { at: now, pos };
    void fetch("/api/movie/progress", {
      method: "POST", keepalive: true, headers: { "content-type": "application/json" },
      body: JSON.stringify({ imdb: t.imdb, media: t.media, season: t.season, episode: t.episode, position: pos, duration: dur, title: t.title, poster: t.poster, year: t.year, epTitle: t.epTitle, episodes: t.episodes }),
    }).catch(() => {});
  };
  // opening a title puts it on the history straight away (at the spot you left, so this never rewinds you)
  useEffect(() => {
    if (!track) return;
    const id = setTimeout(() => report(track.resume ?? 0, 0, true), 4000);
    return () => clearTimeout(id);
  }, [track?.imdb, track?.season, track?.episode]); // eslint-disable-line react-hooks/exhaustive-deps
  const hls = useRef<Hls | null>(null);
  const dash = useRef<{ destroy: () => void } | null>(null); // dash.js, for the DASH sources (Atlantic)
  const [cur, setCur] = useState<MovieSource | undefined>(undefined);

  // Up next when an Iris episode ends (a frame announces this by message; our own <video> has an ended event)
  useEffect(() => {
    const v = video.current;
    if (!v || useEmbed) return;
    const on = () => { if (next && !nextDismissed.current && prefs.current.autoNext && !prefs.current.stopAfter) setNextIn(10); };
    v.addEventListener("ended", on);
    return () => v.removeEventListener("ended", on);
  }, [useEmbed, cur, next]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve 8Stream's HLS only when the Cupcake server is actually in use.
  useEffect(() => {
    if (useEmbed || !streamSrc || sources !== null) return;
    let on = true;
    // 12 seconds is plenty for a warm backend; a cold one is not worth a viewer's wait when an embed server is one tap away
    fetch(streamSrc, { signal: AbortSignal.timeout(12000) }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!on) return;
      const got: MovieSource[] = (d?.sources ?? []).map((s: { label: string; url: string; format?: string; proxy?: string }) => ({ label: s.label, url: s.url, format: s.format === "hls" || s.format === "dash" ? (s.format as "hls" | "dash") : ("mp4" as const), proxy: s.proxy }));
      setSources(got);
      if (got.length) setCur(got[0]);
      else { setNativeDead(true); if (embeds[0]) setServer(embeds[0].name); } // nothing resolved: fall to the first (sandboxed) embed
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
    dash.current?.destroy();
    dash.current = null;
    // One candidate per source: 8Stream's HLS (proxied through our origin) or an
    // embed. A watchdog advances if a source neither starts nor errors within a
    // few seconds, so a dead URL never stalls the player on a long timeout.
    // The direct url first (played with no Referer: the watch page sets a no-referrer policy, which a video element cannot set for itself), then the same-origin proxy for a
    // CDN that insists on being asked a certain way. If both fail, the player says so and offers the third-party servers
    // as a choice (it never switches to one by itself).
    const chain = [cur.url, cur.proxy].filter(Boolean) as string[];
    let idx = 0;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const started = () => { clearTimeout(watchdog); };
    const advance = () => {
      if (cancelled) return;
      clearTimeout(watchdog);
      idx += 1;
      if (idx < chain.length) { play(idx); return; }
      setNativeDead(true);
    };
    const play = (n: number) => {
      v.src = chain[n];
      v.load();
      clearTimeout(watchdog);
      watchdog = setTimeout(advance, n < chain.length - 1 ? 7000 : 15000);
    };
    (async () => {
      if (cur.format === "dash") {
        // DASH has no native <video> support outside Safari's MSE, so dash.js plays it. Its manifest and every segment url
        // are same-origin relay urls (the container rewrote them), so nothing here talks to the provider.
        const { MediaPlayer } = await import("dashjs");
        if (cancelled) return;
        const d = MediaPlayer().create();
        dash.current = d;
        d.on("error", () => { if (!cancelled) setNativeDead(true); });
        d.initialize(v, cur.url, true);
      } else if (cur.format === "hls" && !v.canPlayType("application/vnd.apple.mpegurl")) {
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

  useEffect(() => () => { hls.current?.destroy(); dash.current?.destroy(); }, []);

  // Embed players say where they are with postMessage (two shapes seen in the servers we use: PLAYER_EVENT with
  // currentTime/duration, and MEDIA_DATA with progress.watched/duration, per episode for a series). Only messages from our
  // own player frame are believed.
  useEffect(() => {
    if (!useEmbed) return;
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const d = e.data;
      if (!d || typeof d !== "object") return;
      let pos: number | undefined, dur: number | undefined, force = false;
      if (typeof d.type === "string" && d.type.startsWith("cinesrc:")) {
        if (!track && d.type !== "cinesrc:ready" && d.type !== "cinesrc:loadedmetadata" && d.type !== "cinesrc:play" && d.type !== "cinesrc:ended") return;
        // Zeus: only believed from its own origin. timeupdate carries currentTime and duration; pause and ended save at once.
        if (e.origin !== "https://cinesrc.st") return;
        // "ready" only drops the spinner. A server is alive when it has told us how long the film is: one that says play and
        // ready over a black picture (a later server that does not really have the title) never does, and used to fool the
        // stuck check and the controls into "playing" at 0:00 / 0:00.
        if (d.type === "cinesrc:ready" || d.type === "cinesrc:loadedmetadata" || d.type === "cinesrc:play") setReady(true);
        if ((d.type === "cinesrc:loadedmetadata" || d.type === "cinesrc:timeupdate") && Number(d.duration) > 0) { setAlive(true); setStuck(false); }
        if (d.type === "cinesrc:error") setStuck(true);
        if (d.type === "cinesrc:ended" && next && !nextDismissed.current && prefs.current.autoNext && !prefs.current.stopAfter) setNextIn(10);
        if (d.type === "cinesrc:timeupdate") { pos = Number(d.currentTime); dur = Number(d.duration); }
        else if (d.type === "cinesrc:pause" || d.type === "cinesrc:ended") { force = true; pos = Number(d.currentTime ?? 0) || sent.current.pos; dur = Number(d.duration ?? 0); }
        // its own next-episode button changes the episode inside the frame: follow it, so history and the page stay in step
        const s2 = Number(d.season), e2 = Number(d.episode);
        if (track && track.media === "tv" && s2 > 0 && e2 > 0 && (s2 !== track.season || e2 !== track.episode)) router.replace(`${pathname}?se=${s2}&ep=${e2}`, { scroll: false });
      } else if (d.type === "PLAYER_EVENT" && d.data) {
        pos = Number(d.data.currentTime ?? d.data.player_progress); dur = Number(d.data.duration ?? d.data.player_duration);
        force = d.data.event === "pause" || d.data.event === "ended";
      } else if (d.type === "MEDIA_DATA" && d.data && typeof d.data === "object") {
        const x = Object.values(d.data)[0] as { progress?: { watched?: number; duration?: number }; show_progress?: Record<string, { progress?: { watched?: number; duration?: number } }> } | undefined;
        const ep = track?.media === "tv" ? x?.show_progress?.[`s${track.season}e${track.episode}`]?.progress : undefined;
        const p = ep ?? x?.progress;
        pos = Number(p?.watched); dur = Number(p?.duration);
      }
      if (pos != null && Number.isFinite(pos) && (pos > 0 || force)) report(pos, Number.isFinite(dur) ? dur! : 0, force);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [useEmbed, next?.href, track?.imdb, track?.season, track?.episode]); // eslint-disable-line react-hooks/exhaustive-deps

  // The direct player: the same reports from the <video>, and resuming where you left off.
  useEffect(() => {
    const v = video.current;
    if (!v || !cur || !track) return;
    const tick = () => report(v.currentTime, v.duration || 0);
    const stop = () => report(v.currentTime, v.duration || 0, true);
    const resume = () => { if (track.resume && track.resume > 30 && (!v.duration || track.resume < v.duration - 60) && v.currentTime < 1) v.currentTime = track.resume; };
    v.addEventListener("timeupdate", tick); v.addEventListener("pause", stop); v.addEventListener("ended", stop); v.addEventListener("loadedmetadata", resume);
    return () => { v.removeEventListener("timeupdate", tick); v.removeEventListener("pause", stop); v.removeEventListener("ended", stop); v.removeEventListener("loadedmetadata", resume); };
  }, [cur, track?.imdb, track?.season, track?.episode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Anti-redirect. A third-party frame can send the whole tab somewhere else once somebody has clicked inside it (that is
  // how most ad redirects work), and a sandbox that forbids it is not an option (every server refuses one). So while an
  // embed is on screen the browser is asked to confirm before the page unloads; a redirect the viewer did not ask for
  // shows the "leave this site?" prompt and Cancel keeps them on the page. Our own links are client-side navigations and
  // never trigger it.
  useEffect(() => {
    if (!useEmbed || curEmbed?.sandbox) return; // a sandboxed frame cannot navigate the page, so only unsandboxed ones need the guard
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [useEmbed]);

  // the loader over the poster and the "Up next" countdown, shared by the frame and by Iris
  const overlays = (
    <>
          {!ready && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-night">
              {poster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={poster} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover opacity-30 blur-sm" />
              )}
              <div className="relative flex flex-col items-center gap-3 text-center">
                <Loader2 className="size-12 animate-spin text-frost" />
                <span className="text-[12px] font-extrabold uppercase tracking-[.14em] text-white/70">Getting {track?.title ?? "your title"} ready</span>
              </div>
            </div>
          )}
          {nextIn != null && next && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 backdrop-blur-sm animate-in fade-in">
              <div className="flex flex-col items-center gap-2 text-center text-white sm:gap-4">
                <div className="text-[11px] font-bold uppercase tracking-[.16em] text-frost sm:text-[12px]">Up next · {next.label}</div>
                <div className="relative grid size-16 place-items-center sm:size-24">
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="6" /><circle cx="50" cy="50" r="45" fill="none" stroke="var(--frost)" strokeWidth="6" strokeLinecap="round" strokeDasharray={283} strokeDashoffset={283 * (nextIn / 10)} className="transition-[stroke-dashoffset] duration-1000 ease-linear" /></svg>
                  <span className="font-mono text-[22px] sm:text-[30px]">{nextIn}</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { nextDismissed.current = true; setNextIn(null); }} className="h-10 rounded-full border-1.5 border-white/30 px-5 text-[13.5px] font-bold hover:bg-white/10">Cancel</button>
                  <button type="button" onClick={() => router.push(next.href)} className="h-10 rounded-full bg-frost px-5 text-[13.5px] font-extrabold text-frost-ink">Play now</button>
                </div>
              </div>
            </div>
          )}
    </>
  );

  if (!hasNative && !embeds.length) {
    return <div className="grid aspect-video w-full place-items-center rounded-[26px] border-1.5 border-night-line bg-night text-center text-[14px] font-semibold text-night-muted">This title isn’t playable right now. Try another.</div>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {knownMissing && !tryAnyway ? (
        // members already found that this one does not start, so it is not loaded for everyone to wait on (it expires after a week)
        <div className="grid aspect-video w-full place-items-center rounded-[26px] border-1.5 border-night-line bg-night p-6 text-center">
          <div className="max-w-[440px]">
            <p className="text-[17px] font-extrabold text-night-text">This one isn’t playing for people right now</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-night-muted">Several members tried and it didn’t start, so it probably isn’t on our servers yet. New titles often turn up later.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setTryAnyway(true)} className="h-10 rounded-full border-1.5 border-night-line px-5 text-[13px] font-extrabold text-night-text hover:border-frost-hot">Try anyway</button>
              {trailer && <a href={`https://www.youtube.com/watch?v=${trailer}`} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center rounded-full border-1.5 border-frost-hot bg-frost px-5 text-[13px] font-extrabold text-frost-ink">Watch the trailer</a>}
            </div>
          </div>
        </div>
      ) : askEmbed && curEmbed ? (
        <div className="grid aspect-video w-full place-items-center rounded-[26px] border-1.5 border-night-line bg-night p-6 text-center">
          <div className="max-w-[460px]">
            <p className="text-[17px] font-extrabold text-night-text">{curEmbed.name} is a third-party player</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-night-muted">It is the way to watch some titles, but it is not ours: it can open ad tabs, and the site behind it decides what it shows. Zeus is our own player and has no ads.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setOk(true)} className="h-10 rounded-full border-1.5 border-frost-hot bg-frost px-5 text-[13px] font-extrabold text-frost-ink">Play with {curEmbed.name}</button>
              {hasNative && <button type="button" onClick={() => setServer("cupcake")} className="h-10 rounded-full border-1.5 border-night-line px-5 text-[13px] font-extrabold text-night-text">Back to Iris</button>}
            </div>
          </div>
        </div>
      ) : nativeDead && !curEmbed ? (
        <div className="grid aspect-video w-full place-items-center rounded-[26px] border-1.5 border-night-line bg-night p-6 text-center">
          <div className="max-w-[460px]">
            <p className="text-[17px] font-extrabold text-night-text">Zeus doesn’t have this one yet</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-night-muted">New releases often take a while to arrive. Check back soon.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {embeds.map((e) => <button key={e.name} type="button" onClick={() => setServer(e.name)} className="h-10 rounded-full border-1.5 border-night-line px-5 text-[13px] font-extrabold text-night-text hover:border-frost-hot">Try {e.name}</button>)}
            </div>
          </div>
        </div>
      ) : useEmbed && curEmbed ? (
        // The frame, dressed like the anime player: night ground, 26px corners, a frost spinner over the poster until the
        // player is ready. What is inside the frame is the server's own player and cannot be restyled from here.
        <div ref={box} className={cn("relative isolate overflow-hidden rounded-[26px] border-1.5 border-night-line bg-night shadow-[0_30px_60px_-30px_rgba(0,0,0,.9)] [&:fullscreen]:flex [&:fullscreen]:h-screen [&:fullscreen]:items-center [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:bg-black", theater && !full && "lg:relative lg:left-1/2 lg:w-[min(100vw-2rem,1500px)] lg:-translate-x-1/2")}>
          {/* No sandbox attribute here only for a server that cannot take one (see lib/movie-servers.ts). For Zeus it is set before
              src, so the first request is already sandboxed: scripts and same-origin only, so popups, redirects, top navigation,
              forms, downloads and modals are blocked by the browser. `allow` grants only autoplay, fullscreen and picture-in-picture. */}
          <iframe ref={frame} key={`${frameUrl}#${reloads}`} {...(curEmbed.sandbox ? { sandbox: curEmbed.sandbox } : {})} src={frameUrl} title="Player" allowFullScreen referrerPolicy="origin"
            allow={curEmbed.sandbox ? "autoplay; fullscreen; picture-in-picture" : "autoplay; fullscreen; picture-in-picture; encrypted-media"}
            onLoad={() => setTimeout(() => setReady(true), 900)}
            className="aspect-video w-full bg-black [:fullscreen>&]:max-h-full" />
          {/* our own controls and the cupcake bug over a frame whose own controls are off (see zeus-controls.tsx) */}
          {curEmbed.sandbox && curEmbed.origin && (
            <ZeusControls session={`${frameUrl}#${reloads}`} frame={frame} box={box} origin={curEmbed.origin} ready={ready} prev={prev} next={next} theater={theater} onTheater={() => setTheater((t) => !t)} full={full} onFull={goFull}
              subsFor={track ? { tmdb: track.tmdb, imdb: track.imdb, media: track.media, season: track.season, episode: track.episode, subKey: subKey ?? `m:${track.imdb}`, title: track.title } : undefined}
              onServer={(id, at) => setPick({ server: id, at })} onPrefs={(p) => { prefs.current = p; }} />
          )}
          {stuck && curEmbed.sandbox && (
            <div className="absolute inset-0 z-[40] grid place-items-center bg-night p-6 text-center">
              <div className="max-w-[420px]">
                <p className="text-[17px] font-extrabold text-white">We can’t find this one right now</p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-white/65">It may not be on our servers yet. The player already tries all of them, so another server rarely helps, but you can try. We’ve noted that it didn’t start.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => { const i = ZEUS_SERVERS.findIndex((x) => x.id === (pick?.server ?? "nebula")); setPick({ server: ZEUS_SERVERS[(i + 1) % ZEUS_SERVERS.length].id, at: 0 }); }} className="h-10 rounded-full bg-frost px-5 text-[13px] font-extrabold text-frost-ink">Try another server</button>
                  <button type="button" onClick={() => setReloads((n) => n + 1)} className="h-10 rounded-full border-1.5 border-white/30 px-5 text-[13px] font-bold text-white hover:bg-white/10">Reload</button>
                  {trailer && <a href={`https://www.youtube.com/watch?v=${trailer}`} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center rounded-full border-1.5 border-white/30 px-5 text-[13px] font-bold text-white hover:bg-white/10">Watch the trailer</a>}
                </div>
              </div>
            </div>
          )}
          {overlays}
          {/* the server paints its own promo line over the picture (only the ones that cannot be sandboxed); blur it from our side */}
          {!curEmbed.sandbox && <div aria-hidden className="pointer-events-none absolute left-[24%] top-[71%] h-[13%] w-[52%] rounded-2xl bg-black/60 backdrop-blur-xl [backdrop-filter:blur(18px)]" />}
        </div>
      ) : (
        // Iris: our own <video> (HLS or DASH, never a third-party script) in the same dressed frame as Zeus, driven by the same
        // control bar (zeus-controls.tsx), so the bar, settings, subtitles, skip buttons, theater and "Up next" all match.
        <div ref={box} data-settings className={cn("relative isolate overflow-hidden rounded-[26px] border-1.5 border-night-line bg-night shadow-[0_30px_60px_-30px_rgba(0,0,0,.9)] [&:fullscreen]:flex [&:fullscreen]:h-screen [&:fullscreen]:items-center [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:bg-black", theater && !full && "lg:relative lg:left-1/2 lg:w-[min(100vw-2rem,1500px)] lg:-translate-x-1/2")}>
          <video ref={video} playsInline poster={poster ?? undefined} onLoadedData={() => setReady(true)} className="aspect-video w-full bg-black [:fullscreen>&]:max-h-full" />
          {cur && (
            <ZeusControls video={video} session={cur.url} box={box} ready={ready} prev={prev} next={next} theater={theater} onTheater={() => setTheater((t) => !t)} full={full} onFull={goFull}
              subsFor={track ? { tmdb: track.tmdb, imdb: track.imdb, media: track.media, season: track.season, episode: track.episode, subKey: subKey ?? `m:${track.imdb}`, title: track.title } : undefined}
              srcs={{ sources: (sources ?? []).map((x): Source => ({ id: x.url, label: x.label, audio: "sub" })), current: { id: cur.url, label: cur.label, audio: "sub" }, onPick: (x) => { const m = (sources ?? []).find((y) => y.url === String(x.id)); if (m) setCur(m); } }}
              onServer={() => {}} onPrefs={(p) => { prefs.current = p; }} />
          )}
          {overlays}
        </div>
      )}
      {track?.resume && track.resume > 30 && (
        <p className="px-1 text-[12.5px] font-bold text-frost-text">{useEmbed && !curEmbed?.sandbox ? `You left off at ${mmss(track.resume)}. Drag the bar there to pick up.` : `Resuming from ${mmss(track.resume)}.`}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {useEmbed && (
          <>
            {!curEmbed?.sandbox && (
              <>
                <button type="button" aria-pressed={theater} onClick={() => setTheater((t) => !t)} className={cn("hidden h-9 items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-3 text-[12px] font-extrabold hover:border-frost-hot lg:flex", theater && "border-frost-hot text-frost-text")}><RectangleHorizontal className="size-4" />Theater</button>
                <button type="button" onClick={goFull} className="flex h-9 items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-3 text-[12px] font-extrabold hover:border-frost-hot">{full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}{full ? "Exit" : "Fullscreen"}</button>
              </>
            )}
            <button type="button" onClick={() => setReloads((n) => n + 1)} title="Reload the player at your last spot" className="flex h-9 items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-3 text-[12px] font-extrabold hover:border-frost-hot"><RotateCw className="size-4" />Reload</button>
            {!curEmbed?.sandbox && next && <button type="button" onClick={() => router.push(next.href)} className="ml-auto flex h-9 items-center gap-1.5 rounded-full border-1.5 border-frost-hot bg-frost px-3.5 text-[12px] font-extrabold text-frost-ink">{next.label}<ChevronRight className="size-4" /></button>}
          </>
        )}
        {servers.length > 1 && (
          <div className="mr-1 flex items-center gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-[.12em] text-plum-muted">Server</span>
            {servers.map((s) => (
              <button key={s.k} type="button" aria-pressed={server === s.k} onClick={() => setServer(s.k)} title={s.third ? "Third-party player: may show ads" : "Our own player: no ads"}
                className={cn("h-8 rounded-full border-1.5 border-line bg-cream-card px-3 text-[12px] font-extrabold hover:border-frost-hot", server === s.k && "border-frost-hot bg-frost text-frost-ink")}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
