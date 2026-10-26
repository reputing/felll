"use client";
import * as D from "@radix-ui/react-dialog";
import { Check, FolderPlus, Globe, Loader2, Lock, Plus } from "lucide-react";
import { useState } from "react";
import { OVERLAY, POPUP } from "@/components/ui/popup";
import { addToCollection, createCollection, pickerFor, removeFromCollection, type PickerRow } from "@/lib/collections";
import { toast } from "@/lib/store";
import { cn } from "@/lib/utils";

// "Add to list" — a dialog that lists the viewer's collections with a checkbox
// each (toggles add/remove for this item), plus an inline "new list" field.
export function AddToCollection({ kind, refId, title, cover, className }: { kind: "anime" | "manga"; refId: string; title: string; cover: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PickerRow[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => { setRows(null); try { setRows(await pickerFor(kind, refId)); } catch { setRows([]); } };

  const toggle = async (c: PickerRow) => {
    const next = c.has ? 0 : 1;
    setRows((rs) => rs?.map((r) => (r.id === c.id ? { ...r, has: next } : r)) ?? null);
    try {
      if (next) await addToCollection(c.id, kind, refId, title, cover);
      else await removeFromCollection(c.id, kind, refId);
    } catch (e) {
      setRows((rs) => rs?.map((r) => (r.id === c.id ? { ...r, has: c.has } : r)) ?? null);
      toast((e as Error).message);
    }
  };

  const create = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      const { id } = await createCollection(n);
      await addToCollection(id, kind, refId, title, cover);
      setRows((rs) => [{ id, name: n, visibility: "public", has: 1 }, ...(rs ?? [])]);
      setName("");
      toast(`Added to ${n}`);
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  };

  return (
    <D.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <D.Trigger asChild>
        <button type="button" className={cn("flex h-11 items-center gap-2 rounded-full border-1.5 border-line bg-cream-card px-5 font-bold text-plum-body transition hover:border-frost-hot", className)}>
          <FolderPlus className="size-4" />Add to list
        </button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className={OVERLAY} />
        <D.Content className={cn(POPUP, "fixed left-1/2 top-1/2 w-[min(94vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-shell p-4")}>
          <D.Title className="px-1 text-[16px] font-extrabold">Add to a list</D.Title>
          <D.Description className="sr-only">Pick a collection, or make a new one</D.Description>
          <div className="mt-3 flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="New list name…"
              className="h-10 flex-1 rounded-full border-1.5 border-line bg-paper px-4 text-[14px] font-semibold outline-none focus:border-frost-hot" />
            <button type="button" onClick={create} disabled={busy || !name.trim()} className="grid size-10 flex-none place-items-center rounded-full bg-frost text-frost-ink disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-5" />}</button>
          </div>
          <div className="mt-3 flex max-h-[46vh] flex-col gap-1 overflow-y-auto">
            {rows === null ? (
              <div className="grid place-items-center py-8"><Loader2 className="size-6 animate-spin text-frost-hot" /></div>
            ) : rows.length === 0 ? (
              <p className="py-6 text-center text-[13px] font-semibold text-plum-muted">No lists yet — make one above.</p>
            ) : rows.map((c) => (
              <button key={c.id} type="button" onClick={() => toggle(c)} className="flex items-center gap-3 rounded-2xl p-2 text-left hover:bg-cream-tint">
                <span className={cn("grid size-6 flex-none place-items-center rounded-lg border-1.5 transition", c.has ? "border-frost-hot bg-frost-hot text-white" : "border-line")}>{c.has ? <Check className="size-4" strokeWidth={3} /> : null}</span>
                <span className="flex-1 truncate text-[14px] font-bold">{c.name}</span>
                {c.visibility === "private" ? <Lock className="size-3.5 text-plum-faint" /> : <Globe className="size-3.5 text-plum-faint" />}
              </button>
            ))}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
