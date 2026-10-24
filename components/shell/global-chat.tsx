"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Crown, Loader2, MessageCircle, Send, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ago, cn } from "@/lib/utils";

interface Msg {
  id: number; body: string; created_at: number;
  handle: string; display_name: string; avatar_url: string | null; accent: string; is_plus: number; mine: number;
}

// A live global chat room, docked on the right. Real-time over a WebSocket to
// the ChatRoom Durable Object (worker.ts); if the socket drops it falls back to
// polling and keeps retrying, so it degrades gracefully.
export function GlobalChat({ me }: { me: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [unseen, setUnseen] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);

  const lastId = useRef(0);
  const seen = useRef<Set<number>>(new Set());
  const openRef = useRef(false);
  const nearBottom = useRef(true);
  const listRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { openRef.current = open; }, [open]);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; });
  }, []);

  const apply = useCallback((incoming: Msg[], initial = false) => {
    const fresh = incoming.map((m) => ({ ...m, mine: m.handle === me ? 1 : 0 })).filter((m) => !seen.current.has(m.id));
    if (!fresh.length && !initial) return;
    fresh.forEach((m) => seen.current.add(m.id));
    lastId.current = Math.max(lastId.current, 0, ...incoming.map((m) => m.id));
    setMsgs((cur) => [...(initial ? [] : cur), ...fresh].sort((a, b) => a.id - b.id).slice(-250));
    if (!initial && !openRef.current) setUnseen((n) => n + fresh.filter((m) => !m.mine).length);
    if (openRef.current && (initial || nearBottom.current || fresh.some((m) => m.mine))) scrollDown();
  }, [me, scrollDown]);

  // live socket + history + fallbacks
  useEffect(() => {
    let stopped = false;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;

    const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    const startPoll = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          fetch(`/api/chat?after=${lastId.current}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.messages) apply(d.messages); }).catch(() => {});
        }
      }, 5000);
    };

    const connect = () => {
      if (stopped) return;
      let ws: WebSocket;
      try {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${proto}//${location.host}/api/chat/ws`);
      } catch { startPoll(); return; }
      wsRef.current = ws;
      ws.onopen = () => { tries = 0; setConnected(true); stopPoll(); };
      ws.onmessage = (e) => { try { const d = JSON.parse(e.data as string); if (d.message) apply([d.message]); } catch { /* noise */ } };
      ws.onerror = () => { try { ws.close(); } catch { /* */ } };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (stopped) return;
        startPoll();
        tries = Math.min(tries + 1, 6);
        reconnect = setTimeout(connect, 1000 * tries);
      };
    };

    // history first, then go live
    fetch("/api/chat").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.messages) apply(d.messages, true); }).catch(() => {}).finally(() => setLoaded(true));
    connect();

    return () => { stopped = true; clearTimeout(reconnect); stopPoll(); try { wsRef.current?.close(); } catch { /* */ } };
  }, [apply]);

  useEffect(() => { if (open) { setUnseen(0); scrollDown(); } }, [open, scrollDown]);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setBody("");
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ body: text })); // the DO echoes it back to everyone, us included
      return;
    }
    const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: text }) }).catch(() => null);
    if (res?.ok) { const d = await res.json(); if (d.message) apply([d.message]); }
  };

  // The manga reader is a full-screen overlay; don't float the chat over it.
  if (/^\/manga\/[^/]+\/[^/]+/.test(path)) return null;

  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label="Open chat"
          className="fixed bottom-4 right-4 z-40 flex h-12 items-center gap-2 rounded-full border-1.5 border-line bg-cream-card px-4 font-extrabold text-frost-text shadow-halo transition hover:border-frost-hot sm:bottom-6 sm:right-6">
          <MessageCircle className="size-5" />
          <span className="hidden text-[13px] sm:inline">Chat</span>
          {unseen > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-frost-hot px-1 text-[11px] font-extrabold text-white">{unseen > 99 ? "99+" : unseen}</span>}
        </button>
      )}

      {open && (
        <div className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l-1.5 border-line bg-cream-card shadow-[-20px_0_60px_-30px_rgba(0,0,0,.6)] animate-in slide-in-from-right sm:w-[380px]">
          <div className="flex flex-none items-center justify-between border-b-1.5 border-line px-4 py-3">
            <div>
              <div className="eyebrow flex items-center gap-1.5"><span className={cn("size-1.5 rounded-full", connected ? "bg-sprinkle-mint animate-pulse-dot" : "bg-plum-faint")} />cupcake / live</div>
              <h2 className="text-[17px] font-extrabold tracking-[-.4px]">Global chat</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="grid size-9 place-items-center rounded-full text-plum-muted transition hover:bg-cream-tint hover:text-plum"><X className="size-5" /></button>
          </div>

          <div ref={listRef} onScroll={(e) => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
            className="scrollbar-none flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {!loaded ? (
              <div className="grid flex-1 place-items-center"><Loader2 className="size-6 animate-spin text-frost" /></div>
            ) : msgs.length === 0 ? (
              <p className="m-auto text-center text-[13.5px] font-semibold text-plum-muted">No one’s said anything yet. Go first ✿</p>
            ) : (
              msgs.map((m) => (
                <div key={m.id} className={cn("flex items-start gap-2.5", m.mine && "flex-row-reverse")}>
                  <Link href={`/u/${m.handle}`} className="flex-none"><Avatar src={m.avatar_url} name={m.handle} size={30} ring={m.accent} /></Link>
                  <div className={cn("min-w-0 max-w-[78%]", m.mine && "text-right")}>
                    <div className={cn("flex items-baseline gap-1.5 text-[11.5px]", m.mine && "flex-row-reverse")}>
                      <Link href={`/u/${m.handle}`} className="flex items-center gap-0.5 font-extrabold hover:text-frost-text">{m.display_name}{m.is_plus ? <Crown className="size-2.5 text-sprinkle-star" /> : null}</Link>
                      <span className="font-semibold text-plum-faint">{ago(m.created_at)}</span>
                    </div>
                    <div className={cn("mt-1 inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left text-[13.5px] font-medium", m.mine ? "bg-frost text-frost-ink" : "bg-cream-tint text-plum-body")}>{m.body}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex-none border-t-1.5 border-line p-3">
            <div className="flex items-end gap-2 rounded-2xl border-1.5 border-line bg-paper p-1.5 transition focus-within:border-frost-hot">
              <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Say something to everyone…" rows={1} maxLength={500}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                className="max-h-24 w-full resize-none bg-transparent px-2 py-1.5 text-[13.5px] font-medium text-plum outline-none" />
              <button type="button" onClick={send} disabled={!body.trim()} aria-label="Send"
                className="grid size-9 flex-none place-items-center rounded-xl bg-frost text-frost-ink shadow-press transition disabled:opacity-40">
                <Send className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
