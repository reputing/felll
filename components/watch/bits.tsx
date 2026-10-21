"use client";
import { useEffect, useState } from "react";
import { HandHeart, Loader2 } from "lucide-react";
import { setWatching } from "@/components/shell/presence";
import { toast } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Tells presence what's on screen. */
export function WatchBeacon({ malId, episode, title }: { malId: number; episode: number; title: string }) {
  useEffect(() => {
    setWatching({ malId, episode, title });
    return () => setWatching(null);
  }, [malId, episode, title]);
  return null;
}

export function Reactions({ malId, ep }: { malId: number; ep: number }) {
  const [rs, setRs] = useState<{ emoji: string; n: number; mine: boolean }[] | null>(null);
  useEffect(() => {
    fetch(`/api/reactions?malId=${malId}&ep=${ep}`).then((r) => r.json()).then((j) => setRs(j.reactions)).catch(() => setRs([]));
  }, [malId, ep]);
  const react = async (emoji: string) => {
    setRs((cur) => cur?.map((r) => (r.emoji === emoji ? { ...r, mine: !r.mine, n: r.n + (r.mine ? -1 : 1) } : r.mine ? { ...r, mine: false, n: r.n - 1 } : r)) ?? null);
    const res = await fetch("/api/reactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ malId, ep, emoji }) }).catch(() => null);
    if (res?.ok) setRs((await res.json()).reactions);
  };
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="React to this episode">
      {(rs ?? Array.from({ length: 6 }, () => null)).map((r, i) =>
        r ? (
          <button key={r.emoji} type="button" aria-pressed={r.mine} onClick={() => react(r.emoji)}
            className={cn("flex h-10 items-center gap-1.5 rounded-full border-1.5 px-3 text-[15px] transition hover:-translate-y-0.5", r.mine ? "border-frost-hot bg-cream-blush" : "border-line bg-paper hover:border-frost-hot")}>
            <span className={cn(r.mine && "animate-in zoom-in-50")}>{r.emoji}</span>
            <span className="font-mono text-[12px] text-plum-muted">{r.n || ""}</span>
          </button>
        ) : <span key={i} className="h-10 w-14 rounded-full skeleton" />,
      )}
    </div>
  );
}

export function RequestButton({ malId, title, image, votes, voted }: { malId: number; title: string; image: string | null; votes: number; voted: boolean }) {
  const [state, setState] = useState({ votes, voted });
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const res = await fetch("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ malId, title, image }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast("Couldn’t send that request");
    const j = await res.json();
    setState({ votes: j.votes, voted: j.voted });
    toast(j.voted ? "Requested! We’ll ping you when it lands" : "Request withdrawn");
  };
  return (
    <button type="button" onClick={go} disabled={busy} aria-pressed={state.voted}
      className={cn("flex h-12 items-center gap-2 rounded-full px-6 text-[14.5px] font-extrabold transition", state.voted ? "border-1.5 border-frost-hot bg-cream-blush text-frost-deep" : "bg-frost text-frost-ink shadow-press hover:brightness-105")}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <HandHeart className="size-4" />}
      {state.voted ? "Requested" : "Request this anime"} <span className="font-mono text-[12.5px] opacity-70">{state.votes}</span>
    </button>
  );
}
