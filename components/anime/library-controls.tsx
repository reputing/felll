"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Heart, Minus, Plus, Trash2 } from "lucide-react";
import { SaveIcon } from "@/components/icons";
import { POPUP, POPUP_ITEM, POPUP_SEPARATOR } from "@/components/ui/popup";
import { saveEntry, useBox, type AnimeRef } from "@/lib/store";
import { cn, STATUS_LABEL, STATUSES } from "@/lib/utils";

const DOT: Record<string, string> = { watching: "#4fbf9c", planning: "#4aa6dd", completed: "#9479e8", paused: "#e0a93a", dropped: "#ef8a5c" };

export function LibraryControls({ anime, compact }: { anime: AnimeRef; compact?: boolean }) {
  const e = useBox((s) => s.lib[anime.id]);
  const status = e?.status ?? null;
  const fav = !!e?.favorite;
  const progress = e?.progress ?? 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "gap-1.5")}>
      <Menu.Root>
        <Menu.Trigger className={cn("flex h-11 items-center gap-2 rounded-full border-1.5 px-4 text-[14px] font-extrabold transition", status ? "border-frost-hot bg-cream-blush text-frost-deep" : "border-line bg-paper hover:border-frost-hot")}>
          {status ? <span className="size-2.5 rounded-full" style={{ background: DOT[status] }} /> : <SaveIcon on={false} className="size-4" />}
          {status ? STATUS_LABEL[status] : "Add to my box"}
          <ChevronDown className="size-3.5 opacity-60" strokeWidth={2.6} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="start" sideOffset={8} className={cn(POPUP, "w-[220px]")}>
            {STATUSES.map((s) => (
              <Menu.Item key={s} className={POPUP_ITEM} onSelect={() => saveEntry(anime, { status: s }, `${STATUS_LABEL[s]} · ${anime.title}`)}>
                <span className="size-2.5 rounded-full" style={{ background: DOT[s] }} />
                <span className="flex-1">{STATUS_LABEL[s]}</span>
                {status === s && <Check className="size-4" strokeWidth={3} />}
              </Menu.Item>
            ))}
            {status && (
              <>
                <Menu.Separator className={POPUP_SEPARATOR} />
                <Menu.Item className={POPUP_ITEM} onSelect={() => saveEntry(anime, { status: null }, "Removed from your box")}>
                  <Trash2 className="size-4" /> Remove from box
                </Menu.Item>
              </>
            )}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

      <button type="button" aria-pressed={fav} aria-label={fav ? "Unfavourite" : "Favourite"} onClick={() => saveEntry(anime, { favorite: !fav }, fav ? "Unfavourited" : "Added to favourites ♥")}
        className={cn("grid size-11 place-items-center rounded-full border-1.5 transition", fav ? "border-frost-hot bg-frost-hot text-white" : "border-line bg-paper hover:border-frost-hot hover:text-frost-text")}>
        <Heart className={cn("size-[18px]", fav && "animate-in zoom-in-50")} fill={fav ? "currentColor" : "none"} strokeWidth={2.2} />
      </button>

      {(status === "watching" || status === "paused" || progress > 0) && anime.format !== "Movie" && (
        <div className="flex h-11 items-center gap-1 rounded-full border-1.5 border-line bg-paper px-1.5">
          <button type="button" aria-label="One episode less" onClick={() => saveEntry(anime, { progress: Math.max(0, progress - 1) })} className="grid size-8 place-items-center rounded-full hover:bg-cream-tint"><Minus className="size-3.5" strokeWidth={2.8} /></button>
          <span className="min-w-[64px] text-center font-mono text-[13px]">{progress}<span className="text-plum-muted">/{anime.episodes ?? "?"}</span></span>
          <button type="button" aria-label="One episode more" disabled={!!anime.episodes && progress >= anime.episodes}
            onClick={() => {
              const p = progress + 1;
              const done = !!anime.episodes && p >= anime.episodes;
              saveEntry(anime, { progress: p, ...(done ? { status: "completed" as const } : status ? {} : { status: "watching" as const }) }, done ? "Completed! ✿" : undefined);
            }}
            className="grid size-8 place-items-center rounded-full hover:bg-cream-tint disabled:opacity-40"><Plus className="size-3.5" strokeWidth={2.8} /></button>
        </div>
      )}
    </div>
  );
}
