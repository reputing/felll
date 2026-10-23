"use client";
import Link from "next/link";
import { Crown, EyeOff, Heart, Loader2, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Confirm } from "@/components/ui/confirm";
import { toast } from "@/lib/store";
import { ago, cn } from "@/lib/utils";

interface C {
  id: number; parent_id: number | null; body: string; spoiler: number; likes: number; created_at: number; edited_at: number | null; deleted: number;
  handle: string; display_name: string; avatar_url: string | null; accent: string; is_plus: number; liked: number; mine: number;
}

/** "||like this||" hides a phrase; @handle links to the member. */
function Body({ text }: { text: string }) {
  const parts = text.split(/(\|\|[\s\S]+?\|\||@[a-z0-9_-]{2,32})/gi);
  return (
    <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-plum-body">
      {parts.map((p, i) =>
        p.startsWith("||") && p.endsWith("||") && p.length > 4 ? <Spoiler key={i}>{p.slice(2, -2)}</Spoiler>
        : /^@[a-z0-9_-]{2,32}$/i.test(p) ? <Link key={i} href={`/u/${p.slice(1).toLowerCase()}`} className="font-bold text-frost-text hover:underline">{p}</Link>
        : p,
      )}
    </p>
  );
}

function Spoiler({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span role="button" tabIndex={0} onClick={() => setOpen(true)} onKeyDown={(e) => e.key === "Enter" && setOpen(true)} data-open={open || undefined}
      className="spoiler rounded bg-cream-blush px-1 transition-[filter]" title={open ? undefined : "Spoiler: click to show"}>{children}</span>
  );
}

function Composer({ onSend, placeholder, autoFocus, initial = "", onCancel, cta = "Post" }: { onSend: (body: string, spoiler: boolean) => Promise<boolean>; placeholder: string; autoFocus?: boolean; initial?: string; onCancel?: () => void; cta?: string }) {
  const [body, setBody] = useState(initial);
  const [spoiler, setSpoiler] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    if (await onSend(body, spoiler)) { setBody(""); setSpoiler(false); }
    setBusy(false);
  };
  return (
    <div className="rounded-3xl border-1.5 border-line bg-paper p-2 transition focus-within:border-frost-hot focus-within:shadow-halo">
      <textarea value={body} autoFocus={autoFocus} onChange={(e) => setBody(e.target.value)} placeholder={placeholder} rows={body.split("\n").length > 2 ? 4 : 2} maxLength={4000}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
        className="w-full resize-none bg-transparent px-3 py-2 text-[14px] font-medium text-plum outline-none" />
      <div className="flex flex-wrap items-center gap-2 px-1">
        <button type="button" aria-pressed={spoiler} onClick={() => setSpoiler(!spoiler)} className={cn("flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold", spoiler ? "bg-frost-hot text-white" : "bg-cream-tint text-plum-muted hover:text-frost-text")}>
          <EyeOff className="size-3.5" /> Spoiler
        </button>
        <span className="hidden text-[11.5px] font-semibold text-plum-faint sm:inline">||hide a bit|| · @mention · ⌘↵ to send</span>
        <span className="flex-1" />
        {onCancel && <button type="button" onClick={onCancel} className="h-8 rounded-full px-3 text-[12.5px] font-bold text-plum-muted hover:text-plum">Cancel</button>}
        <button type="button" onClick={send} disabled={!body.trim() || busy} className="flex h-9 items-center gap-1.5 rounded-full bg-frost px-4 text-[13px] font-extrabold text-frost-ink shadow-press disabled:opacity-50">
          {busy && <Loader2 className="size-3.5 animate-spin" />}{cta}
        </button>
      </div>
    </div>
  );
}

export function Comments({ malId, episode, title, image, heading, api = "/api/comments", scope }: { malId?: number; episode?: number; title: string; image?: string | null; heading?: string; api?: string; scope?: Record<string, string | number | undefined> }) {
  // The thread's identity. Anime pass malId/episode; manga pass a scope like
  // { mangaId }. The same API verbs (/PUT /PATCH /DELETE by id) serve both.
  const thread = scope ?? { malId, ep: episode };
  const threadKey = JSON.stringify(thread);
  const [rows, setRows] = useState<C[] | null>(null);
  const [admin, setAdmin] = useState(false);
  const [sort, setSort] = useState<"top" | "new">("top");
  const [replying, setReplying] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  // only load once the section is near the screen
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(thread)) if (v != null) qs.set(k, String(v));
    qs.set("sort", sort);
    const res = await fetch(`${api}?${qs}`).catch(() => null);
    if (!res?.ok) { setRows([]); return; }
    const j = await res.json();
    setRows(j.comments);
    setAdmin(j.admin);
  }, [api, threadKey, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (visible) load(); }, [visible, load]);

  const post = async (body: string, spoiler: boolean, parentId?: number) => {
    const res = await fetch(api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...thread, parentId, body, spoiler, title, image }) });
    if (!res.ok) { toast((await res.json().catch(() => ({}))).error || "Couldn’t post that"); return false; }
    setReplying(null);
    await load();
    return true;
  };
  const like = async (c: C) => {
    setRows((rs) => rs?.map((r) => (r.id === c.id ? { ...r, liked: r.liked ? 0 : 1, likes: r.likes + (r.liked ? -1 : 1) } : r)) ?? null);
    await fetch(api, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id }) });
  };
  const edit = async (c: C, body: string) => {
    const res = await fetch(api, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id, body }) });
    if (res.ok) { setEditing(null); await load(); }
    return res.ok;
  };
  const remove = async (c: C) => {
    await fetch(api, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id }) });
    toast("Comment deleted");
    await load();
  };

  const top = rows?.filter((r) => !r.parent_id) ?? [];
  const replies = (id: number) => (rows ?? []).filter((r) => r.parent_id === id).sort((a, b) => a.created_at - b.created_at);

  const one = (c: C, isReply = false) => (
    <div id={`c${c.id}`} key={c.id} className={cn("grid scroll-mt-28 grid-cols-[40px_1fr] gap-3", isReply && "grid-cols-[32px_1fr]")}>
      {c.deleted ? <span className="size-10 rounded-full bg-cream-tint" /> : <Link href={`/u/${c.handle}`}><Avatar src={c.avatar_url} name={c.handle} size={isReply ? 32 : 40} ring={c.accent} /></Link>}
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
          {c.deleted ? <span className="font-bold text-plum-faint">deleted</span> : (
            <Link href={`/u/${c.handle}`} className="flex items-center gap-1 font-extrabold hover:text-frost-text">{c.display_name}{c.is_plus ? <Crown className="size-3 text-sprinkle-star" /> : null}</Link>
          )}
          {!c.deleted && <span className="font-semibold text-plum-faint">@{c.handle}</span>}
          <span className="text-[12px] font-semibold text-plum-faint">· {ago(c.created_at)}{c.edited_at ? " · edited" : ""}</span>
        </div>
        {c.deleted ? <p className="text-[13.5px] italic text-plum-faint">This comment was removed.</p>
          : editing === c.id ? <div className="mt-1.5"><Composer initial={c.body} autoFocus cta="Save" placeholder="Edit" onCancel={() => setEditing(null)} onSend={(b) => edit(c, b)} /></div>
          : c.spoiler ? <SpoilerBlock><Body text={c.body} /></SpoilerBlock>
          : <Body text={c.body} />}
        {!c.deleted && editing !== c.id && (
          <div className="mt-1.5 flex items-center gap-1 text-[12px] font-bold text-plum-muted">
            <button type="button" onClick={() => like(c)} aria-pressed={!!c.liked} className={cn("flex h-8 items-center gap-1.5 rounded-full px-2.5 hover:bg-cream-tint", c.liked && "text-frost-hot")}>
              <Heart className={cn("size-3.5", c.liked && "animate-in zoom-in-50")} fill={c.liked ? "currentColor" : "none"} /> {c.likes || ""}
            </button>
            {!isReply && <button type="button" onClick={() => setReplying(replying === c.id ? null : c.id)} className="flex h-8 items-center gap-1.5 rounded-full px-2.5 hover:bg-cream-tint"><MessageCircle className="size-3.5" /> Reply</button>}
            {!!c.mine && <button type="button" onClick={() => setEditing(c.id)} className="flex h-8 items-center gap-1.5 rounded-full px-2.5 hover:bg-cream-tint"><Pencil className="size-3.5" /> Edit</button>}
            {(!!c.mine || admin) && (
              <Confirm title="Delete this comment?" body="It’ll be replaced with “removed”. Replies stay." action="Delete" onConfirm={() => remove(c)}>
                <button type="button" className="flex h-8 items-center gap-1.5 rounded-full px-2.5 hover:bg-cream-tint hover:text-frost-text"><Trash2 className="size-3.5" /> Delete</button>
              </Confirm>
            )}
          </div>
        )}
        {!isReply && (
          <div className="mt-2 flex flex-col gap-3 border-l-1.5 border-line-soft pl-4 empty:hidden">
            {replies(c.id).map((r) => one(r, true))}
            {replying === c.id && <Composer autoFocus placeholder={`Reply to @${c.handle}…`} onCancel={() => setReplying(null)} onSend={(b, s) => post(b, s, c.id)} cta="Reply" />}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <section ref={ref} id="comments" aria-labelledby="cm" className="scroll-mt-28 rounded-box border-1.5 border-line bg-cream-card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">{episode ? `Episode ${episode} thread` : "Series thread"}</div>
          <h2 id="cm" className="mt-1 text-xl font-extrabold tracking-[-.6px]">{heading ?? "Talk about it"} <span className="font-mono text-[15px] font-medium text-frost-text">{rows ? top.length : ""}</span></h2>
        </div>
        <div className="flex rounded-full border-1.5 border-line bg-cream-tint p-[3px]">
          {(["top", "new"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={sort === s} onClick={() => setSort(s)} className={cn("h-8 rounded-full px-3.5 text-[12.5px] font-extrabold capitalize text-plum-muted", sort === s && "bg-paper text-frost-text shadow-[0_2px_6px_-2px_rgb(var(--glow)/.4)]")}>{s}</button>
          ))}
        </div>
      </div>
      <Composer placeholder={episode ? `What did you think of episode ${episode}?` : `Say something about ${title}…`} onSend={(b, s) => post(b, s)} />
      <div className="mt-5 flex flex-col gap-5">
        {rows === null && [0, 1, 2].map((i) => <div key={i} className="h-16 rounded-2xl skeleton" />)}
        {rows?.length === 0 && <p className="py-6 text-center text-[13.5px] font-semibold text-plum-muted">No one’s said anything yet. Go first ✿</p>}
        {top.map((c) => one(c))}
      </div>
    </section>
  );
}

function SpoilerBlock({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (open) return <>{children}</>;
  return (
    <button type="button" onClick={() => setOpen(true)} className="mt-1 flex w-full items-center gap-2 rounded-2xl border-1.5 border-dashed border-line-hot bg-cream-blush px-4 py-3 text-left text-[13px] font-bold text-frost-deep">
      <EyeOff className="size-4" /> Spoiler · tap to reveal
    </button>
  );
}
