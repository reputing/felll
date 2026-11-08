"use client";
import { useEffect, useState } from "react";
import { SaveIcon } from "@/components/icons";
import { toast } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { MangaFull } from "@/lib/manga";

const LABEL: Record<string, string> = { reading: "Reading", planning: "Plan to read", completed: "Completed", paused: "On hold", dropped: "Dropped" };

// Save a manga to your library (the manga counterpart of the anime SaveToggle).
export function MangaSaveButton({ manga }: { manga: MangaFull }) {
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/manga/library?id=${manga.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) { setSaved(!!d?.saved); setStatus(d?.status ?? null); } })
      .catch(() => {});
    return () => { live = false; };
  }, [manga.id]);

  const toggle = async () => {
    const next = !saved;
    setSaved(next);
    setBusy(true);
    const res = await fetch("/api/manga/library", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next ? { mangaId: manga.id, title: manga.title, cover: manga.cover, status: status ?? "reading" } : { mangaId: manga.id, remove: true }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setSaved(!next); toast("Couldn’t save that, try again"); return; }
    if (next && !status) setStatus("reading");
    toast(next ? "Saved to your manga ✿" : "Removed from your manga");
  };

  // Reading / Completed / ... — the manga counterpart of an anime's list status
  const pick = async (v: string) => {
    if (v === "remove") { setSaved(false); setStatus(null); await fetch("/api/manga/library", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mangaId: manga.id, remove: true }) }).catch(() => null); toast("Removed from your manga"); return; }
    const prev = status;
    setStatus(v); setSaved(true);
    const res = await fetch("/api/manga/library", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mangaId: manga.id, title: manga.title, cover: manga.cover, status: v }) }).catch(() => null);
    if (!res?.ok) { setStatus(prev); toast("Couldn’t save that, try again"); return; }
    toast(`Marked ${LABEL[v].toLowerCase()} ✿`);
  };

  return (
    <>
    <select value={saved ? status ?? "reading" : ""} onChange={(e) => pick(e.target.value)} aria-label="Reading status"
      className="h-11 rounded-xl border-1.5 border-night-edge bg-night/40 px-3 text-[13.5px] font-extrabold text-night-text outline-none backdrop-blur hover:border-frost focus:border-frost">
      {!saved && <option value="" disabled>Add to list</option>}
      {Object.entries(LABEL).map(([k, v]) => <option key={k} value={k} className="text-plum">{v}</option>)}
      {saved && <option value="remove" className="text-plum">Remove</option>}
    </select>
    <button type="button" aria-pressed={saved} disabled={busy} onClick={toggle}
      className={cn("flex h-11 items-center gap-2 rounded-xl border-1.5 border-night-edge bg-night/40 px-4 text-[13.5px] font-extrabold text-night-text backdrop-blur transition hover:border-frost disabled:opacity-60", saved && "border-frost bg-frost text-frost-ink hover:border-frost")}>
      <SaveIcon on={saved} className="size-4" /> {saved ? "Saved" : "Save"}
    </button>
    </>
  );
}
