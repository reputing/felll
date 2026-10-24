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

// A live global chat room, docked on the right. Polls every few seconds while
// visible (no websockets on Workers), so it feels live without a realtime layer.
export function GlobalChat() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const lastId = useRef(0);
  const openRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);

  useEffect(() => { openRef.current = open; }, [open]);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; });
  }, []);

  const apply = useCallback((incoming: Msg[], initial = false) => {
    if (!incoming.length && !initial) return;
    lastId.current = Math.max(lastId.current, 0, ...incoming.map((m) => m.id));
    setMsgs((cur) => (initial ? incoming : [...cur, ...incoming]).slice(-250));
    if (!initial && !openRef.current) setUnseen((n) => n + incoming.filter((m) => !m.mine).length);
    if (openRef.current && (initial || nearBottom.current || incoming.some((m) => m.mine))) scrollDown();
  }, [scrollDown]);

  // initial load + poll (independent of open state, so it keeps a live unread count)
  useEffect(() => {
    let on = true;
    const load = async (url: string, initial = false) => {
      const r = await fetch(url).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (on && r?.messages) { apply(r.messages, initial); if (initial) setLoaded(true); }
    };
    load("/api/chat", true);
    const iv = setInterval(() => { if (document.visibilityState === "visible") load(`/api/chat?after=${lastId.current}`); }, 5000);
    return () => { on = false; clearInterval(iv); };
  }, [apply]);

  useEffect(() => { if (open) { setUnseen(0); scrollDown(); } }, [open, scrollDown]);

  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: text }) }).catch(() => null);
    if (res?.ok) { const d = await res.json(); setBody(""); if (d.message) apply([d.message]); }
    setBusy(false);
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
              <div className="eyebrow">cupcake / live</div>
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
              <button type="button" onClick={send} disabled={!body.trim() || busy} aria-label="Send"
                className="grid size-9 flex-none place-items-center rounded-xl bg-frost text-frost-ink shadow-press transition disabled:opacity-40">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
