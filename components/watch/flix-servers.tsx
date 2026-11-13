"use client";
import { Loader2, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Optional extra anime servers (Flixcloud, found through Reanime's resolver). Collapsed until a viewer asks: nothing is requested
// for people who never open it. It is labelled for what it is, because it is not the same as our own player:
//   it may show ads (the player loads third-party ad and tracking scripts inside its frame), progress is not saved, and it does not
//   always start (its stream request sometimes answers 410). The frame is sandboxed (scripts and same-origin only: no popups, no redirects
//   of this page, no forms, downloads or modals). Never relax that sandbox because a server shows an error.
interface Policy { sandbox: string; allow: string; referrerPolicy: string; origin: string }
interface Server { name: string; language: string; hardsub: boolean; embedUrl: string }
interface Result { servers: Server[]; policy: Policy; notice: string }

export function FlixServers({ anilistId, episode }: { anilistId: number | null; episode: number }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "none" | "error">("idle");
  const [res, setRes] = useState<Result | null>(null);
  const [pick, setPick] = useState<number | null>(null);

  // a new episode starts fresh: nothing stays loaded from the last one
  useEffect(() => { setOpen(false); setState("idle"); setRes(null); setPick(null); }, [anilistId, episode]);

  if (!anilistId) return null;

  const toggle = async () => {
    if (open) { setOpen(false); setPick(null); return; }
    setOpen(true);
    if (res || state === "loading") return;
    setState("loading");
    try {
      const r = await fetch(`/api/anime-flix?anilistId=${anilistId}&episode=${episode}`);
      const d = (await r.json().catch(() => ({}))) as Partial<Result> & { error?: string };
      if (!r.ok) { setState("error"); return; }
      if (!d.servers?.length || !d.policy) { setState("none"); return; }
      setRes(d as Result);
      setState("idle");
    } catch { setState("error"); }
  };

  const cur = res && pick != null ? res.servers[pick] : null;
  // our own player stops when an outside one starts, so two videos never play over each other
  const choose = (i: number) => { document.querySelectorAll("video").forEach((v) => v.pause()); setPick(i); };

  return (
    <section aria-label="More servers" className="rounded-box border-1.5 border-line bg-cream-card p-4">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span>
          <span className="eyebrow">More servers</span>
          <span className="ml-2 rounded-full bg-cream-tint px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[.08em] text-plum-muted">beta</span>
        </span>
        <span className="text-[13px] font-bold text-frost-text">{open ? "hide" : "show"}</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="flex items-start gap-2 rounded-xl border-1.5 border-line bg-cream-blush p-3 text-[12.5px] font-semibold leading-snug text-plum-body">
            <TriangleAlert className="mt-0.5 size-4 flex-none text-frost-text" aria-hidden />
            <span>These come from another site&rsquo;s player. They may show ads, your progress isn&rsquo;t saved, and it doesn&rsquo;t always start. Popups and redirects are blocked.</span>
          </p>
          {state === "loading" && <div className="flex items-center gap-2 text-[13px] font-semibold text-plum-muted"><Loader2 className="size-4 animate-spin" />looking for servers…</div>}
          {state === "none" && <p className="text-[13px] font-semibold text-plum-muted">no extra servers for this episode right now.</p>}
          {state === "error" && <p role="alert" className="text-[13px] font-semibold text-plum-muted">couldn&rsquo;t reach the server list. try again in a moment.</p>}
          {res && (
            <div className="flex flex-wrap gap-2">
              {res.servers.map((s, i) => (
                <button key={`${s.embedUrl}-${s.language}`} type="button" onClick={() => choose(i)} aria-pressed={pick === i}
                  className={cn("h-10 rounded-full border-1.5 px-4 text-[13px] font-extrabold transition hover:border-frost-hot", pick === i ? "border-frost-hot bg-frost text-frost-ink" : "border-line bg-paper")}>
                  {s.name} · {s.language}
                </button>
              ))}
            </div>
          )}
          {cur && res && (
            <div className="relative overflow-hidden rounded-[22px] border-1.5 border-night-line bg-black">
              {/* sandbox is set before src, so the first request is already sandboxed (key forces a fresh element per server) */}
              <iframe
                key={cur.embedUrl}
                title={`${cur.name} player`}
                sandbox={res.policy.sandbox}
                allow={res.policy.allow}
                referrerPolicy={res.policy.referrerPolicy as React.HTMLAttributeReferrerPolicy}
                allowFullScreen
                src={cur.embedUrl}
                className="aspect-video w-full bg-black"
              />
              <button type="button" onClick={() => setPick(null)} aria-label="Close this player" className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"><X className="size-4" /></button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
