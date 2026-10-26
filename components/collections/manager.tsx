"use client";
import Link from "next/link";
import { FolderPlus, Globe, Loader2, Lock, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { createCollection, myCollections, type CollectionCard } from "@/lib/collections";
import { toast } from "@/lib/store";

export function CollectionCover({ covers }: { covers: string[] }) {
  return (
    <div className="grid aspect-[3/2] grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-2xl border-1.5 border-line bg-cream-tint">
      {Array.from({ length: 4 }).map((_, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <span key={i} className="overflow-hidden bg-cream-blush">{covers[i] && <img src={covers[i]} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />}</span>
      ))}
    </div>
  );
}

export function CollectionsManager() {
  const [cols, setCols] = useState<CollectionCard[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { myCollections().then(setCols).catch(() => setCols([])); }, []);

  const create = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      const { id } = await createCollection(n);
      setCols((c) => [{ id, name: n, visibility: "public", count: 0, covers: [] }, ...(c ?? [])]);
      setName("");
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="New list name…"
          className="h-12 flex-1 rounded-full border-1.5 border-line bg-cream-card px-5 text-[15px] font-semibold outline-none focus:border-frost-hot focus:shadow-halo" />
        <button type="button" onClick={create} disabled={busy || !name.trim()} className="flex h-12 items-center gap-2 rounded-full bg-frost px-5 font-extrabold text-frost-ink disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-5" />}New list</button>
      </div>
      {cols === null ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[3/2] animate-pulse rounded-2xl bg-cream-card" />)}</div>
      ) : cols.length === 0 ? (
        <div className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">
          <FolderPlus className="mx-auto mb-2 size-6" />Make your first list — mix anime and manga, keep it private or share it.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {cols.map((c) => (
            <Link key={c.id} href={`/collections/${c.id}`} className="group flex flex-col gap-2">
              <CollectionCover covers={c.covers} />
              <div className="flex items-center gap-1.5 px-0.5">
                <span className="min-w-0 flex-1 truncate text-[14px] font-extrabold group-hover:text-frost-text">{c.name}</span>
                {c.visibility === "private" ? <Lock className="size-3.5 text-plum-faint" /> : <Globe className="size-3.5 text-plum-faint" />}
              </div>
              <span className="-mt-1 px-0.5 text-[12px] font-semibold text-plum-muted">{c.count} {c.count === 1 ? "item" : "items"}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
