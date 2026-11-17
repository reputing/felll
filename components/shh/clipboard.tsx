"use client";
import * as D from "@radix-ui/react-dialog";
import { useRef, useState } from "react";
import { Check, ClipboardPaste, Copy, Loader2, Trash2 } from "lucide-react";
import { OVERLAY, POPUP } from "@/components/ui/popup";
import { toast } from "@/lib/store";
import { cn } from "@/lib/utils";

// A shelf for text you paste once and copy back with one tap (long prompts, snippets, anything). Kept on the account, so it
// follows you across devices. Bodies are fetched in the background when the box opens, so Copy is instant and still counts as a
// tap (a browser only allows a clipboard write straight after one, not after waiting on the network).

interface Clip { id: string; title: string; size: number; preview: string }

async function post(code: string, body: Record<string, unknown>) {
  const r = await fetch("/api/shh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, code }) });
  const d = await r.json().catch(() => ({})); // always read the body: a rejection says why
  if (!r.ok) throw new Error(d?.error || `http ${r.status}`);
  return d;
}
const sizeLabel = (n: number) => (n < 1000 ? `${n} chars` : n < 1_000_000 ? `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k chars` : `${(n / 1_000_000).toFixed(1)}M chars`);

export function ClipboardBox({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState("");
  const bodies = useRef(new Map<string, string>());

  const prefetch = async (list: Clip[]) => {
    for (const c of list) {
      if (bodies.current.has(c.id)) continue;
      try { const d = await post(code, { op: "clip_get", id: c.id }); bodies.current.set(c.id, String(d.body ?? "")); } catch { /* copy will fetch it */ }
    }
  };
  const load = async () => {
    try { const d = await post(code, { op: "clip_list" }); const list: Clip[] = d.clips || []; setClips(list); prefetch(list); }
    catch (e) { setClips([]); toast(e instanceof Error ? e.message : "couldn’t load your clipboard"); }
  };

  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const d = await post(code, { op: "clip_put", title, body: text });
      bodies.current.set(d.id, text);
      setText(""); setTitle(""); toast("saved ♡");
      await load();
    } catch (e) { toast(e instanceof Error ? e.message : "couldn’t save"); }
    setSaving(false);
  };
  const paste = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) setText(t); else toast("your clipboard is empty"); }
    catch { toast("couldn’t read the clipboard here, paste into the box instead"); }
  };
  const copy = async (c: Clip) => {
    let body = bodies.current.get(c.id);
    if (body == null) {
      try { body = String((await post(code, { op: "clip_get", id: c.id })).body ?? ""); bodies.current.set(c.id, body); } catch { toast("couldn’t load that one"); return; }
    }
    try { await navigator.clipboard.writeText(body); }
    catch { toast("tap copy once more"); return; } // the browser wanted a fresh tap; the text is loaded now
    setDone(c.id); setTimeout(() => setDone(""), 1400);
  };
  const remove = async (c: Clip) => {
    setClips((l) => (l ? l.filter((x) => x.id !== c.id) : l)); bodies.current.delete(c.id);
    try { await post(code, { op: "clip_delete", id: c.id }); } catch { toast("couldn’t delete that"); load(); }
  };

  return (
    <D.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <D.Trigger asChild>
        <button type="button" aria-label="Clipboard" title="save text and copy it back in one tap" className="flex h-10 items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-3.5 text-[13px] font-bold text-plum-muted hover:border-frost-hot"><ClipboardPaste className="size-3.5" />Clipboard</button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className={OVERLAY} />
        <D.Content className={cn(POPUP, "fixed left-1/2 top-1/2 flex max-h-[85vh] w-[min(94vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-shell p-5")}>
          <D.Title className="text-[17px] font-extrabold">Clipboard</D.Title>
          <D.Description className="sr-only">Save text once and copy it again with one tap</D.Description>
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-semibold text-plum-muted">paste anything long here once, then copy it back with one tap from any device you’re signed in on.</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="name (optional)" className="h-11 rounded-2xl border-1.5 border-line bg-cream-card px-4 text-[14px] outline-none focus:border-frost-hot" />
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="paste here…" className="resize-y rounded-2xl border-1.5 border-line bg-cream-card px-4 py-3 text-[14px] outline-none focus:border-frost-hot" />
            <div className="flex items-center gap-2">
              <button type="button" onClick={paste} className="flex h-11 items-center gap-1.5 rounded-full border-1.5 border-line px-4 text-[13px] font-bold hover:border-frost-hot"><ClipboardPaste className="size-4" />paste</button>
              <span className="flex-1 text-right text-[11.5px] font-semibold text-plum-muted">{text ? sizeLabel(text.length) : ""}</span>
              <button type="button" onClick={save} disabled={!text.trim() || saving} className="flex h-11 items-center gap-1.5 rounded-full bg-frost px-5 text-[13px] font-extrabold text-frost-ink disabled:opacity-50">{saving ? <Loader2 className="size-4 animate-spin" /> : null}save</button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-extrabold">Saved</span>
            {clips === null ? (
              <p className="py-4 text-center"><Loader2 className="mx-auto size-4 animate-spin text-frost-hot" /></p>
            ) : clips.length === 0 ? (
              <p className="rounded-2xl border-1.5 border-dashed border-line bg-cream-card p-4 text-center text-[12.5px] font-semibold text-plum-muted">nothing saved yet</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {clips.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 rounded-2xl border-1.5 border-line bg-cream-card px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-extrabold">{c.title || c.preview.split("\n")[0].slice(0, 60) || "untitled"}</div>
                      <div className="truncate text-[11.5px] font-semibold text-plum-muted">{sizeLabel(c.size)}{c.title ? ` · ${c.preview.replace(/\s+/g, " ").slice(0, 50)}` : ""}</div>
                    </div>
                    <button type="button" onClick={() => copy(c)} className="flex h-11 min-w-[88px] items-center justify-center gap-1.5 rounded-full bg-frost px-4 text-[13px] font-extrabold text-frost-ink">{done === c.id ? <Check className="size-4" /> : <Copy className="size-4" />}{done === c.id ? "copied" : "copy"}</button>
                    <button type="button" onClick={() => remove(c)} aria-label="delete" className="grid size-11 flex-none place-items-center rounded-full text-plum-muted hover:bg-black/5 hover:text-red-500"><Trash2 className="size-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
