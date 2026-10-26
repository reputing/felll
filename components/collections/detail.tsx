"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe, Lock, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Poster } from "@/components/poster";
import { Confirm } from "@/components/ui/confirm";
import { deleteCollection, getCollection, itemHref, removeFromCollection, renameCollection, setCollectionVisibility, type CollectionFull, type CollectionItem } from "@/lib/collections";
import { toast } from "@/lib/store";

type State = { collection: CollectionFull; items: CollectionItem[]; mine: boolean } | "loading" | "gone";

export function CollectionDetail({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<State>("loading");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => { getCollection(id).then((d) => { setData(d); setName(d.collection.name); }).catch(() => setData("gone")); }, [id]);

  if (data === "loading") return <div className="h-64 animate-pulse rounded-shell bg-cream-card" />;
  if (data === "gone") return <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">This list is private or gone.</p>;
  const { collection: c, items, mine } = data;

  const saveName = async () => {
    const n = name.trim();
    if (!n) return;
    try { await renameCollection(id, n); setData({ ...data, collection: { ...c, name: n } }); setEditing(false); } catch (e) { toast((e as Error).message); }
  };
  const toggleVis = async () => {
    const v = c.visibility === "public" ? "private" : "public";
    try { await setCollectionVisibility(id, v); setData({ ...data, collection: { ...c, visibility: v } }); } catch (e) { toast((e as Error).message); }
  };
  const remove = async (it: CollectionItem) => {
    setData({ ...data, items: items.filter((x) => !(x.kind === it.kind && x.ref_id === it.ref_id)) });
    try { await removeFromCollection(id, it.kind, it.ref_id); } catch (e) { toast((e as Error).message); }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex gap-2"><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} autoFocus className="h-11 flex-1 rounded-full border-1.5 border-frost-hot bg-cream-card px-5 text-[18px] font-extrabold outline-none" /><button type="button" onClick={saveName} className="rounded-full bg-frost px-4 font-extrabold text-frost-ink">Save</button></div>
          ) : (
            <h1 className="flex items-center gap-2 text-[clamp(24px,3.4vw,36px)] font-extrabold tracking-[-1px]">{c.name}{mine && <button type="button" onClick={() => setEditing(true)} aria-label="Rename" className="text-plum-faint hover:text-frost-text"><Pencil className="size-4" /></button>}</h1>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold text-plum-muted">
            <Link href={`/u/${c.handle}`} className="flex items-center gap-1.5 hover:text-frost-text"><Avatar src={c.avatar_url} name={c.handle} size={22} />{c.display_name}</Link>
            <span>· {items.length} items ·</span>
            <span className="flex items-center gap-1">{c.visibility === "private" ? <><Lock className="size-3" />private</> : <><Globe className="size-3" />public</>}</span>
          </div>
        </div>
        {mine && (
          <div className="flex gap-2">
            <button type="button" onClick={toggleVis} className="flex h-10 items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold hover:border-frost-hot">{c.visibility === "public" ? <><Lock className="size-4" />Make private</> : <><Globe className="size-4" />Make public</>}</button>
            <Confirm title="Delete this list?" body="The list is removed. The anime and manga themselves are untouched." action="Delete" onConfirm={async () => { await deleteCollection(id); toast("List deleted"); router.push("/collections"); }}>
              <button type="button" className="flex h-10 items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold text-frost-text hover:border-frost-hot"><Trash2 className="size-4" />Delete</button>
            </Confirm>
          </div>
        )}
      </section>

      {items.length === 0 ? (
        <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">Nothing here yet. Add anime or manga from their pages with “Add to list”.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((it) => (
            <div key={`${it.kind}:${it.ref_id}`} className="group relative flex flex-col gap-1.5">
              <Link href={itemHref(it)} className="flex flex-col gap-1.5">
                <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-1.5 border-line shadow-poster transition group-hover:-translate-y-1 group-hover:border-frost-hot">
                  <Poster src={it.cover} className="size-full" />
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[.08em] text-white">{it.kind}</span>
                </div>
                <div className="line-clamp-2 text-[13px] font-extrabold leading-tight">{it.title || "Untitled"}</div>
              </Link>
              {mine && <button type="button" onClick={() => remove(it)} aria-label="Remove" className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100 hover:bg-frost-hot"><X className="size-4" strokeWidth={3} /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
