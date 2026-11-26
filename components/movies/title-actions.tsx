"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Eye, Heart, Star, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SaveIcon } from "@/components/icons";
import { AddToCollection } from "@/components/collections/add-button";
import { POPUP, POPUP_ITEM, POPUP_SEPARATOR } from "@/components/ui/popup";
import { toast } from "@/lib/store";
import { cn, STATUS_LABEL, STATUSES, type ListStatus } from "@/lib/utils";

// The same controls an anime page has (a status, a favourite, a ten-point rating), for a film or a series. It loads the
// member's entry once, then every change shows at once and is saved behind it (undone with a toast if the save fails).
export interface TitleRef { imdb: string; media: "movie" | "tv"; title: string; poster: string | null; year: number | null; episodes: number | null }
interface Entry { status: ListStatus | null; score: number | null; favorite: boolean; progress: number }

const DOT: Record<string, string> = { watching: "#4fbf9c", planning: "#4aa6dd", completed: "#9479e8", paused: "#e0a93a", dropped: "#ef8a5c" };
const WORDS = ["", "Appalling", "Horrible", "Very bad", "Bad", "Average", "Fine", "Good", "Very good", "Great", "Masterpiece"];
const EMPTY: Entry = { status: null, score: null, favorite: false, progress: 0 };

export function TitleActions({ t, cupcake }: { t: TitleRef; cupcake?: { avg: number | null; n: number } }) {
  const [e, setE] = useState<Entry | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let on = true;
    fetch(`/api/movie/library?id=${t.imdb}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (on) setE(d?.entry ? { ...EMPTY, ...d.entry } : EMPTY); }).catch(() => on && setE(EMPTY));
    return () => { on = false; };
  }, [t.imdb]);

  const cur = e ?? EMPTY;
  const save = async (patch: Partial<Entry>, message?: string) => {
    const before = e;
    setE({ ...cur, ...patch });
    try {
      const res = await fetch("/api/movie/library", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...t, ...patch }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      if (d?.entry) setE({ ...EMPTY, ...d.entry });
      if (message) toast(message);
    } catch { setE(before); toast("Couldn’t save that, try again"); }
  };
  const noun = t.media === "tv" ? "series" : "film";
  const shown = hover ?? cur.score ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Menu.Root>
          <Menu.Trigger className={cn("flex h-11 items-center gap-2 rounded-full border-1.5 px-4 text-[14px] font-extrabold transition", cur.status ? "border-frost-hot bg-cream-blush text-frost-deep" : "border-line bg-paper hover:border-frost-hot")}>
            {cur.status ? <span className="size-2.5 rounded-full" style={{ background: DOT[cur.status] }} /> : <SaveIcon on={false} className="size-4" />}
            {cur.status ? STATUS_LABEL[cur.status] : "Add to my list"}
            <ChevronDown className="size-3.5 opacity-60" strokeWidth={2.6} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content align="start" sideOffset={8} className={cn(POPUP, "w-[220px]")}>
              {STATUSES.map((s) => (
                <Menu.Item key={s} className={POPUP_ITEM} onSelect={() => save({ status: s }, `${STATUS_LABEL[s]} · ${t.title}`)}>
                  <span className="size-2.5 rounded-full" style={{ background: DOT[s] }} />
                  <span className="flex-1">{STATUS_LABEL[s]}</span>
                  {cur.status === s && <Check className="size-4" strokeWidth={3} />}
                </Menu.Item>
              ))}
              {cur.status && (
                <>
                  <Menu.Separator className={POPUP_SEPARATOR} />
                  <Menu.Item className={POPUP_ITEM} onSelect={() => save({ status: null }, "Removed from your list")}><Trash2 className="size-4" /> Remove from list</Menu.Item>
                </>
              )}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>

        <button type="button" aria-pressed={cur.favorite} aria-label={cur.favorite ? "Unfavourite" : "Favourite"} onClick={() => save({ favorite: !cur.favorite }, cur.favorite ? "Unfavourited" : "Added to favourites ♥")}
          className={cn("grid size-11 place-items-center rounded-full border-1.5 transition", cur.favorite ? "border-frost-hot bg-frost-hot text-white" : "border-line bg-paper hover:border-frost-hot hover:text-frost-text")}>
          <Heart className="size-[18px]" fill={cur.favorite ? "currentColor" : "none"} strokeWidth={2.2} />
        </button>

        {t.media === "movie" && (
          <button type="button" onClick={() => save({ status: "completed" }, `Marked as watched · ${t.title}`)} disabled={cur.status === "completed"}
            className="flex h-11 items-center gap-2 rounded-full border-1.5 border-line bg-paper px-4 text-[14px] font-extrabold transition hover:border-frost-hot disabled:opacity-60">
            <Eye className="size-4" />{cur.status === "completed" ? "Watched" : "Mark watched"}
          </button>
        )}

        <AddToCollection kind={t.media} refId={t.imdb} title={t.title} cover={t.poster} className="h-11 bg-paper" />

        {t.media === "tv" && (
          <span className="flex h-11 items-center rounded-full border-1.5 border-line bg-paper px-4 font-mono text-[13px]">
            {cur.progress}<span className="text-plum-muted">/{t.episodes ?? "?"} episodes</span>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">Your rating</span>
          <span className="text-[12px] font-bold text-frost-text">
            {shown ? `${shown}/10 · ${WORDS[shown]}` : `Rate this ${noun}`}
            {cupcake?.avg != null && <span className="ml-2 text-plum-muted">cupcake {cupcake.avg.toFixed(1)} · {cupcake.n} {cupcake.n === 1 ? "rating" : "ratings"}</span>}
          </span>
        </div>
        <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)} role="radiogroup" aria-label="Rate out of 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={cur.score === n} aria-label={`${n} out of 10`}
              onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(null)}
              onClick={() => save({ score: n }, `Rated ${n}/10`)}
              className="grid h-9 flex-1 place-items-center rounded-lg transition hover:scale-110">
              <Star className={cn("size-[22px] transition-colors", n <= shown ? "fill-sprinkle-star text-sprinkle-star" : "text-line-hot")} strokeWidth={2} />
            </button>
          ))}
          {cur.score != null && (
            <button type="button" aria-label="Clear rating" onClick={() => save({ score: null }, "Rating cleared")} className="ml-1 grid size-8 place-items-center rounded-full text-plum-muted hover:bg-cream-tint hover:text-frost-text"><X className="size-3.5" strokeWidth={2.8} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
