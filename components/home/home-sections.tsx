"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { BlurFade } from "@/components/fx/blur-fade";

// The rows under the hero, in whatever order you like. The server renders them in the default
// order; this reads your saved layout (kept on this device) and reorders/hides them. "Edit home"
// shows move and hide controls on every row, including ones that are hidden or empty right now.

export interface HomeSection { id: string; label: string; node: ReactNode }
interface Layout { order: string[]; hidden: string[] }
const KEY = "cupcake:home-layout";

function load(): Layout {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null") as Layout | null;
    if (v && Array.isArray(v.order) && Array.isArray(v.hidden)) return v;
  } catch { /* storage off */ }
  return { order: [], hidden: [] };
}

export function HomeSections({ sections }: { sections: HomeSection[] }) {
  const [layout, setLayout] = useState<Layout>({ order: [], hidden: [] });
  const [editing, setEditing] = useState(false);
  useEffect(() => setLayout(load()), []);

  const save = (l: Layout) => { setLayout(l); try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* */ } };
  // saved order first (ignoring ids that no longer exist), then anything new in its default spot
  const ids = sections.map((s) => s.id);
  const order = [...layout.order.filter((id) => ids.includes(id)), ...ids.filter((id) => !layout.order.includes(id))];
  const byId = new Map(sections.map((s) => [s.id, s]));
  const move = (id: string, d: -1 | 1) => {
    const i = order.indexOf(id), j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    save({ ...layout, order: next });
  };
  const toggle = (id: string) => save({ order, hidden: layout.hidden.includes(id) ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id] });

  return (
    <>
      <div className="-mb-4 flex justify-end gap-2">
        {editing && (
          <button type="button" onClick={() => save({ order: [], hidden: [] })} className="flex h-8 items-center gap-1.5 rounded-full border-1.5 border-line px-3 text-[12.5px] font-bold text-plum-muted hover:border-frost-hot">
            <RotateCcw className="size-3.5" />Reset
          </button>
        )}
        <button type="button" onClick={() => setEditing((e) => !e)} aria-pressed={editing}
          className={cn("flex h-8 items-center gap-1.5 rounded-full border-1.5 px-3 text-[12.5px] font-bold", editing ? "border-frost-hot bg-frost text-frost-ink" : "border-line text-plum-muted hover:border-frost-hot")}>
          <SlidersHorizontal className="size-3.5" />{editing ? "Done" : "Edit home"}
        </button>
      </div>
      {order.map((id, i) => {
        const s = byId.get(id)!;
        const hidden = layout.hidden.includes(id);
        if (hidden && !editing) return null;
        return (
          <div key={id} className={cn("has-[>.bf:empty]:hidden", editing && "rounded-3xl border-1.5 border-dashed border-line p-3", hidden && "opacity-50")}>
            {editing && (
              <div className="mb-3 flex items-center gap-1.5">
                <span className="mr-auto text-[12.5px] font-extrabold uppercase tracking-[.08em] text-plum-muted">{s.label}</span>
                <button type="button" disabled={i === 0} onClick={() => move(id, -1)} aria-label={`Move ${s.label} up`} className="grid size-8 place-items-center rounded-full border-1.5 border-line hover:border-frost-hot disabled:opacity-30"><ArrowUp className="size-4" /></button>
                <button type="button" disabled={i === order.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${s.label} down`} className="grid size-8 place-items-center rounded-full border-1.5 border-line hover:border-frost-hot disabled:opacity-30"><ArrowDown className="size-4" /></button>
                <button type="button" onClick={() => toggle(id)} aria-label={hidden ? `Show ${s.label}` : `Hide ${s.label}`} className="grid size-8 place-items-center rounded-full border-1.5 border-line hover:border-frost-hot">{hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
              </div>
            )}
            {!hidden && (editing ? s.node : <BlurFade>{s.node}</BlurFade>)}
          </div>
        );
      })}
    </>
  );
}
