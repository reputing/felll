"use client";
import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { bestOffset, parseSubs, toSrt, toVtt, type Cue } from "@/lib/subs";
import type { SyncState } from "./settings-panel";
import type { Track } from "./player";

// Everything about a video's subtitles except drawing them: the provider tracks we can read, the
// file the member uploaded for this title (kept on their account), timing, download and the
// audio-listening auto-sync. Used by the anime player and the movie player.
export function useSubs({ video, subKey, title, ep, tracks, caption, setCaption }: {
  video: RefObject<HTMLVideoElement | null>; subKey: string; title: string; ep: number | null; tracks: Track[];
  caption: string | number | null; setCaption: Dispatch<SetStateAction<string | number | null>>;
}) {
  const [mine, setMine] = useState<{ name: string; body: string } | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [cuesFailed, setCuesFailed] = useState(false);
  const cueCache = useRef(new Map<string, Cue[]>());
  const [offset, setOffsetState] = useState(0);
  const [sync, setSync] = useState<SyncState>({ phase: "idle", msg: "", progress: 0 });
  const audioGraph = useRef<{ ctx: AudioContext; an: AnalyserNode } | null>(null);
  const subs0 = tracks;
  const autoMine = useRef(false);
  useEffect(() => {
    let on = true;
    setMine(null); autoMine.current = false;
    fetch(`/api/subs?key=${subKey}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (on && d?.body) setMine({ name: d.name, body: d.body }); }).catch(() => {});
    return () => { on = false; };
  }, [subKey]);
  // a file you uploaded for this episode is on standby: it turns itself on the first time the episode opens
  useEffect(() => { if (mine && !autoMine.current) { autoMine.current = true; setCaption((c) => c ?? "mine"); } }, [mine]);

  // timing is remembered per episode
  useEffect(() => { try { setOffsetState(Number(localStorage.getItem(`suboff:${subKey}`)) || 0); } catch { setOffsetState(0); } setSync({ phase: "idle", msg: "", progress: 0 }); }, [subKey]);
  const setOffset = useCallback((v: number) => { setOffsetState(v); try { if (v) localStorage.setItem(`suboff:${subKey}`, String(v)); else localStorage.removeItem(`suboff:${subKey}`); } catch { /* */ } }, [subKey]);

  useEffect(() => {
    setCuesFailed(false);
    if (caption == null) { setCues([]); return; }
    if (caption === "mine") { setCues(mine ? parseSubs(mine.body) : []); return; }
    const tr = subs0.find((x) => x.id === caption);
    if (!tr) { setCues([]); return; }
    const hit = cueCache.current.get(tr.url);
    if (hit) { setCues(hit); return; }
    let on = true;
    setCues([]);
    fetch(tr.url).then((r) => (r.ok ? r.text() : Promise.reject(new Error("fetch")))).then((txt) => {
      const c = parseSubs(txt);
      if (!c.length) throw new Error("empty");
      cueCache.current.set(tr.url, c);
      if (on) setCues(c);
    }).catch(() => { if (on) setCuesFailed(true); }); // can't read it here: the browser's own track draws it instead
    return () => { on = false; };
  }, [caption, mine, subs0]);

  const uploadSubs = useCallback(async (f: File): Promise<string | null> => {
    if (f.size > 800_000) return "that file is too big for subtitles";
    const body = await f.text();
    if (parseSubs(body).length < 3) return "couldn't read subtitles in that file (use .srt, .vtt or .ass)";
    const res = await fetch("/api/subs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: subKey, name: f.name, body }) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) return d?.error || "couldn't save that file";
    setMine({ name: f.name, body }); setCaption("mine"); setOffset(0);
    return null;
  }, [subKey, setOffset]);
  const removeMine = useCallback(() => {
    fetch(`/api/subs?key=${subKey}`, { method: "DELETE" }).catch(() => {});
    setMine(null); setCaption((c) => (c === "mine" ? null : c));
  }, [subKey]);
  const downloadSubs = useCallback((fmt: "srt" | "vtt") => {
    if (!cues.length) return;
    const blob = new Blob([fmt === "srt" ? toSrt(cues, offset) : toVtt(cues, offset)], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w .-]+/g, "").trim() || "subtitles"} ${ep != null ? `- ep ${ep}` : ""}${offset ? ` (synced ${offset > 0 ? "+" : ""}${offset}s)` : ""}.${fmt}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, [cues, offset, title, ep]);

  // Auto-sync: listen to the speech in the audio while it plays and line the subtitles up with it.
  const autoSync = useCallback(async () => {
    const v = video.current;
    if (!v || !cues.length) return;
    const same = v.currentSrc.startsWith("blob:") || v.currentSrc.startsWith(location.origin);
    if (!same) { setSync({ phase: "error", msg: "This server can't be listened to. Try another server, or nudge the timing by hand.", progress: 0 }); return; }
    try {
      if (!audioGraph.current) {
        const ctx = new AudioContext();
        const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0.2;
        const src = ctx.createMediaElementSource(v);
        src.connect(an); an.connect(ctx.destination);
        audioGraph.current = { ctx, an };
      }
    } catch { setSync({ phase: "error", msg: "This browser won't let cupcake listen to the audio.", progress: 0 }); return; }
    const { ctx, an } = audioGraph.current;
    await ctx.resume().catch(() => {});
    if (v.paused) await v.play().catch(() => {});
    const SPAN = 60, BIN = 0.1;
    const samples: { t: number; e: number }[] = [];
    const bins = new Float32Array(an.frequencyBinCount);
    const lo = Math.round(300 / (ctx.sampleRate / an.fftSize)), hi = Math.round(3400 / (ctx.sampleRate / an.fftSize));
    setSync({ phase: "listening", msg: "Keep it playing, about a minute.", progress: 0 });
    let lastT = v.currentTime;
    await new Promise<void>((resolve) => {
      const iv = setInterval(() => {
        if (v.paused) return;
        // a seek restarts the take: the audio has to be one continuous stretch
        if (Math.abs(v.currentTime - lastT) > 1.5) samples.length = 0;
        lastT = v.currentTime;
        an.getFloatFrequencyData(bins);
        let sum = 0; for (let i = lo; i < hi; i++) sum += Math.pow(10, Math.max(-100, bins[i]) / 10);
        samples.push({ t: v.currentTime, e: Math.log10(1e-12 + sum / (hi - lo)) });
        const span = samples.length > 1 ? samples[samples.length - 1].t - samples[0].t : 0;
        setSync((s) => (s.phase === "listening" ? { ...s, progress: Math.min(1, span / SPAN) } : s));
        if (span >= SPAN || v.ended) { clearInterval(iv); resolve(); }
      }, 100);
    });
    if (samples.length < 100) { setSync({ phase: "error", msg: "Didn't hear enough. Press play and try again.", progress: 0 }); return; }
    const t0 = samples[0].t, n = Math.floor((samples[samples.length - 1].t - t0) / BIN);
    const energy = new Float32Array(n);
    const cnt = new Float32Array(n);
    for (const x of samples) { const i = Math.min(n - 1, Math.floor((x.t - t0) / BIN)); energy[i] += x.e; cnt[i]++; }
    for (let i = 0; i < n; i++) energy[i] = cnt[i] ? energy[i] / cnt[i] : i ? energy[i - 1] : 0;
    const r = bestOffset(cues, energy, t0, BIN);
    if (!r || r.confidence < 0.25) { setSync({ phase: "error", msg: "Couldn't find a clear match here (lots of music, or little talking). Try again in a scene with dialogue.", progress: 0 }); return; }
    setOffset(r.offset);
    setSync({ phase: "done", msg: `Synced: ${r.offset > 0 ? "+" : ""}${r.offset}s (${r.confidence > 0.7 ? "high" : "medium"} confidence). You can still nudge it.`, progress: 1 });
  }, [cues, setOffset]);
  useEffect(() => () => { audioGraph.current?.ctx.close().catch(() => {}); }, []);

  return { mine, cues, cuesFailed, offset, setOffset, sync, uploadSubs, removeMine, downloadSubs, autoSync, overlayOn: caption != null && cues.length > 0 && !cuesFailed };
}

/** While the video is in a mode our overlay can't reach (the browser's own fullscreen, plain PiP),
 *  hand the browser the same cues, time-shifted, as a text track. */
export function useNativeCues(video: RefObject<HTMLVideoElement | null>, cues: Cue[], offset: number, enabled: boolean) {
  useEffect(() => {
    const v = video.current;
    if (!enabled || !v || !cues.length) return;
    const tt = v.addTextTrack("subtitles", "cupcake", "en");
    tt.mode = "showing";
    for (const c of cues) { try { tt.addCue(new VTTCue(c.start + offset, c.end + offset, c.text.replace(/<[^>]+>/g, ""))); } catch { /* bad cue */ } }
    return () => { tt.mode = "disabled"; Array.from(tt.cues ?? []).forEach((c) => tt.removeCue(c)); };
  }, [video, cues, offset, enabled]);
}
