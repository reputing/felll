"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Heart, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SaveIcon } from "@/components/icons";
import { POPUP, POPUP_ITEM, POPUP_SEPARATOR } from "@/components/ui/popup";
import { toast } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { MangaFull } from "@/lib/manga";

const LABEL: Record<string, string> = { reading: "Reading", planning: "Plan to read", completed: "Completed", paused: "On hold", dropped: "Dropped" };
const DOT: Record<string, string> = { reading: "#4fbf9c", planning: "#4aa6dd", completed: "#9479e8", paused: "#e0a93a", dropped: "#ef8a5c" };

// A manga's place on your shelf: the same two controls an anime page has, a status menu (reading, plan to read, completed,
// on hold, dropped) and a favourite heart. It used to be a plain browser <select> labelled "Add to list", right beside the
// real "Add to list" (collections) button, so it read as a second one of those and nobody found the status.
export function MangaSaveButton({ manga }: { manga: MangaFull }) {
  const [status, setStatus] = useState<string | null>(null);
  const [fav, setFav] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/manga/library?id=${manga.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) { setStatus(d?.saved ? d.status ?? "reading" : null); setFav(!!d?.favorite); } })
      .catch(() => {});
    return () => { live = false; };
  }, [manga.id]);

  const send = (body: Record<string, unknown>) => fetch("/api/manga/library", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mangaId: manga.id, ...body }) }).catch(() => null);

  const pick = async (v: string) => {
    const prev = status;
    setStatus(v);
    const res = await send({ title: manga.title, cover: manga.cover, status: v });
    if (!res?.ok) { setStatus(prev); toast("Couldn’t save that, try again"); return; }
    toast(`${LABEL[v]} · ${manga.title}`);
  };
  const remove = async () => {
    const prev = { status, fav };
    setStatus(null); setFav(false);
    const res = await send({ remove: true });
    if (!res?.ok) { setStatus(prev.status); setFav(prev.fav); toast("Couldn’t save that, try again"); return; }
    toast("Removed from your shelf");
  };
  const toggleFav = async () => {
    const next = !fav;
    setFav(next);
    // favouriting something you have not shelved puts it on the shelf as "plan to read" (the library has no row without a status)
    const asStatus = status ?? "planning";
    if (!status) setStatus(asStatus);
    const res = await send({ title: manga.title, cover: manga.cover, status: asStatus, favorite: next });
    if (!res?.ok) { setFav(!next); toast("Couldn’t save that, try again"); return; }
    toast(next ? "Added to favourites ♥" : "Unfavourited");
  };

  return (
    <>
      <Menu.Root>
        <Menu.Trigger className={cn("flex h-11 items-center gap-2 rounded-xl border-1.5 px-4 text-[13.5px] font-extrabold backdrop-blur transition", status ? "border-frost bg-frost/15 text-night-text" : "border-night-edge bg-night/40 text-night-text hover:border-frost")}>
          {status ? <span className="size-2.5 rounded-full" style={{ background: DOT[status] }} /> : <SaveIcon on={false} className="size-4" />}
          {status ? LABEL[status] : "Add to my shelf"}
          <ChevronDown className="size-3.5 opacity-60" strokeWidth={2.6} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="start" sideOffset={8} className={cn(POPUP, "w-[220px]")}>
            {Object.entries(LABEL).map(([k, v]) => (
              <Menu.Item key={k} className={POPUP_ITEM} onSelect={() => pick(k)}>
                <span className="size-2.5 rounded-full" style={{ background: DOT[k] }} />
                <span className="flex-1">{v}</span>
                {status === k && <Check className="size-4" strokeWidth={3} />}
              </Menu.Item>
            ))}
            {status && (
              <>
                <Menu.Separator className={POPUP_SEPARATOR} />
                <Menu.Item className={POPUP_ITEM} onSelect={remove}><Trash2 className="size-4" /> Remove from shelf</Menu.Item>
              </>
            )}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

      <button type="button" aria-pressed={fav} aria-label={fav ? "Unfavourite" : "Favourite"} onClick={toggleFav}
        className={cn("grid size-11 place-items-center rounded-xl border-1.5 backdrop-blur transition", fav ? "border-frost bg-frost text-frost-ink" : "border-night-edge bg-night/40 text-night-text hover:border-frost")}>
        <Heart className="size-[18px]" fill={fav ? "currentColor" : "none"} strokeWidth={2.2} />
      </button>
    </>
  );
}
