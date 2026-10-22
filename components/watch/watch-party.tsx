"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Watch Together: one person hosts, the rest follow. The host heartbeats its
// playback state to /api/party every couple of seconds; members poll it and
// seek/pause/navigate to match. Sync is best-effort (polling, ~2s), which is
// plenty for watching an episode in step.
const BEAT_MS = 2000;
const code6 = () => Math.random().toString(36).slice(2, 8);

export function WatchParty({ video, malId, ep }: { video: React.RefObject<HTMLVideoElement | null>; malId: number; ep: number }) {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [host, setHost] = useState<string | null>(null);
  const [alive, setAlive] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const lastEp = useRef(ep);
  lastEp.current = ep;

  // pick up an existing party from the URL (survives episode navigation)
  useEffect(() => {
    try {
      const c = new URLSearchParams(window.location.search).get("party");
      if (c) { setCode(c); setIsHost(sessionStorage.getItem(`ph:${c}`) === "1"); setOpen(true); }
    } catch { /* ignore */ }
  }, []);

  const setParam = useCallback((c: string | null) => {
    try {
      const url = new URL(window.location.href);
      if (c) url.searchParams.set("party", c); else url.searchParams.delete("party");
      router.replace(url.pathname + url.search, { scroll: false });
    } catch { /* ignore */ }
  }, [router]);

  const start = useCallback(() => {
    const c = code6();
    try { sessionStorage.setItem(`ph:${c}`, "1"); } catch { /* ignore */ }
    setCode(c); setIsHost(true); setOpen(true); setParam(c);
  }, [setParam]);

  const leave = useCallback(() => {
    if (code) try { sessionStorage.removeItem(`ph:${code}`); } catch { /* ignore */ }
    setCode(null); setIsHost(false); setHost(null); setAlive(false); setParam(null);
  }, [code, setParam]);

  // host: broadcast state
  useEffect(() => {
    if (!code || !isHost) return;
    const beat = () => {
      const v = video.current;
      if (!v) return;
      fetch("/api/party", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, malId, ep, position: v.currentTime, paused: v.paused }),
      }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, BEAT_MS);
    return () => clearInterval(id);
  }, [code, isHost, malId, ep, video]);

  // member: follow the host
  useEffect(() => {
    if (!code || isHost) return;
    let stop = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/party?code=${code}`);
        const d = (await r.json()) as { exists?: boolean; alive?: boolean; host?: string; malId?: number; ep?: number; position?: number; paused?: boolean };
        if (stop) return;
        setHost(d.host ?? null); setAlive(!!d.alive);
        if (!d.exists || !d.alive) return;
        if (d.malId === malId && d.ep !== lastEp.current) { router.push(`/watch/${malId}/${d.ep}?party=${code}`); return; }
        const v = video.current;
        if (!v || d.position == null) return;
        if (Math.abs(v.currentTime - d.position) > 2) v.currentTime = d.position;
        if (d.paused && !v.paused) v.pause();
        else if (!d.paused && v.paused) v.play().catch(() => {});
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, BEAT_MS);
    return () => { stop = true; clearInterval(id); };
  }, [code, isHost, malId, router, video]);

  const copy = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("party", code!);
      navigator.clipboard?.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  if (!code) {
    return (
      <button type="button" onClick={start} aria-label="Start a watch party"
        className="flex h-9 items-center gap-1.5 rounded-full border-1.5 border-white/25 bg-black/50 px-3 text-[12.5px] font-extrabold text-white backdrop-blur-md transition hover:bg-frost hover:text-frost-ink">
        <Users className="size-4" /> Watch together
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 rounded-full border-1.5 border-frost/60 bg-black/55 px-3 text-[12.5px] font-extrabold text-white backdrop-blur-md">
        <span className={cn("size-2 rounded-full", isHost || alive ? "bg-sprinkle-mint animate-pulse-dot" : "bg-sprinkle-butter")} />
        {isHost ? "Hosting" : alive ? `Watching ${host ?? "party"}` : "Reconnecting…"}
      </button>
      {open && (
        <div className="w-[230px] rounded-2xl border-1.5 border-white/15 bg-black/70 p-3 text-white backdrop-blur-xl">
          <div className="text-[11px] font-bold uppercase tracking-[.12em] text-white/60">{isHost ? "You’re hosting" : "Synced to host"}</div>
          <p className="mt-1 text-[12.5px] font-semibold text-white/85">
            {isHost ? "Share this link — everyone who opens it follows your playback." : "Your player follows the host’s play, pause and seeks."}
          </p>
          <div className="mt-2.5 flex gap-1.5">
            {isHost && (
              <button type="button" onClick={copy} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-frost text-[12.5px] font-extrabold text-frost-ink">
                {copied ? <><Check className="size-4" /> Copied</> : <><Copy className="size-4" /> Copy link</>}
              </button>
            )}
            <button type="button" onClick={leave} className={cn("flex h-9 items-center justify-center gap-1.5 rounded-full border-1.5 border-white/25 px-3 text-[12.5px] font-bold hover:bg-white/10", !isHost && "flex-1")}>
              <X className="size-4" /> Leave
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
