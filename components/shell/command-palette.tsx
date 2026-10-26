"use client";
import * as D from "@radix-ui/react-dialog";
import { CalendarClock, Compass, Dice5, FolderHeart, LibraryBig, Loader2, Search, Settings, Trophy, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { OVERLAY, POPUP } from "@/components/ui/popup";
import { set, useBox } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Hit { kind: "anime" | "manga" | "member" | "go"; href: string; title: string; sub: string; image?: string | null; Icon?: typeof Search }

const PAGES: Hit[] = [
  { kind: "go", href: "/home", title: "Explore", sub: "the watch box", Icon: Compass },
  { kind: "go", href: "/seasonal", title: "Seasonal", sub: "this season, with drop timers", Icon: CalendarClock },
  { kind: "go", href: "/rankings", title: "Rankings", sub: "top airing, all time, most loved", Icon: Trophy },
  { kind: "go", href: "/box", title: "My box", sub: "your anime lists", Icon: LibraryBig },
  { kind: "go", href: "/collections", title: "Collections", sub: "your custom lists", Icon: FolderHeart },
  { kind: "go", href: "/community", title: "Community", sub: "feed, members, leaderboard", Icon: Users },
  { kind: "go", href: "/api/random", title: "Surprise me", sub: "a random anime", Icon: Dice5 },
  { kind: "go", href: "/settings", title: "Customize", sub: "your page and skin", Icon: Settings },
];

export function CommandPalette() {
  const open = useBox((s) => s.palette);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [i, setI] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) { setHits([]); setBusy(false); return; }
    setBusy(true);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal }).catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as { anime: { id: number; title: string; sub: string; image: string | null }[]; manga?: { id: string; title: string; sub: string; image: string | null }[]; members: { handle: string; display_name: string; avatar_url: string | null }[] };
      setHits([
        ...body.anime.map((a) => ({ kind: "anime" as const, href: `/anime/${a.id}`, title: a.title, sub: a.sub, image: a.image })),
        ...(body.manga ?? []).map((m) => ({ kind: "manga" as const, href: `/manga/${m.id}`, title: m.title, sub: m.sub, image: m.image })),
        ...body.members.map((m) => ({ kind: "member" as const, href: `/u/${m.handle}`, title: m.display_name, sub: `@${m.handle}`, image: m.avatar_url })),
      ]);
      setBusy(false);
      setI(0);
    }, 220);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pages = PAGES.filter((p) => !term || p.title.toLowerCase().includes(term));
    return [...hits, ...pages];
  }, [hits, q]);

  const go = (h: Hit | undefined) => {
    if (!h) return;
    set({ palette: false });
    setQ("");
    if (h.href.startsWith("/api/")) window.location.assign(h.href);
    else router.push(h.href);
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
  }, [i]);

  return (
    <D.Root open={open} onOpenChange={(o) => set({ palette: o })}>
      <D.Portal>
        <D.Overlay className={OVERLAY} />
        <D.Content className={cn(POPUP, "fixed left-1/2 top-[12vh] w-[min(94vw,620px)] -translate-x-1/2 overflow-hidden rounded-shell p-0")}>
          <D.Title className="sr-only">Search cupcake</D.Title>
          <D.Description className="sr-only">Find an anime, a member or a page</D.Description>
          <div className="relative border-b-1.5 border-line-soft">
            {busy ? <Loader2 className="absolute left-5 top-1/2 size-5 -translate-y-1/2 animate-spin text-frost-hot" /> : <Search className="absolute left-5 top-1/2 size-5 -translate-y-1/2 text-plum-muted" />}
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, shown.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
                if (e.key === "Enter") { e.preventDefault(); if (q.trim() && !shown.length) go({ kind: "go", href: `/browse?q=${encodeURIComponent(q.trim())}`, title: "", sub: "" }); else go(shown[i]); }
              }}
              placeholder="Search anime, manga, members, pages…"
              className="h-16 w-full bg-transparent pl-14 pr-5 text-[16px] font-semibold text-plum outline-none"
            />
          </div>
          <div ref={listRef} className="max-h-[56vh] overflow-y-auto p-2">
            {shown.map((h, n) => (
              <button key={h.kind + h.href} data-i={n} type="button" onMouseMove={() => setI(n)} onClick={() => go(h)}
                className={cn("grid w-full grid-cols-[40px_1fr_auto] items-center gap-3 rounded-2xl p-2 text-left", n === i && "bg-cream-blush")}>
                {h.kind === "anime" || h.kind === "manga" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <span className="h-[52px] w-10 overflow-hidden rounded-[10px] bg-cream-tint">{h.image && <img src={h.image} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />}</span>
                ) : h.kind === "member" ? (
                  <Avatar src={h.image} name={h.sub} size={40} />
                ) : (
                  <span className="grid size-10 place-items-center rounded-xl bg-cream-tint text-frost-text">{h.Icon && <h.Icon className="size-[18px]" />}</span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-extrabold">{h.title}</span>
                  <span className="block truncate text-[12px] font-semibold text-plum-muted">{h.sub}</span>
                </span>
                <span className="text-[10.5px] font-bold uppercase tracking-[.1em] text-plum-faint">{h.kind === "go" ? "page" : h.kind}</span>
              </button>
            ))}
            {q.trim().length >= 2 && !busy && hits.length === 0 && (
              <p className="px-3 py-3 text-[13px] text-plum-muted">No quick matches. Press <kbd className="rounded-md border border-line bg-cream-tint px-1.5 font-mono text-[11px]">Enter</kbd> to search everything.</p>
            )}
          </div>
          <div className="flex items-center gap-4 border-t-1.5 border-line-soft px-5 py-2.5 text-[11.5px] font-semibold text-plum-muted">
            <span><kbd className="font-mono">↑↓</kbd> move</span><span><kbd className="font-mono">↵</kbd> open</span><span><kbd className="font-mono">esc</kbd> close</span>
            <span className="ml-auto">cupcake search</span>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
