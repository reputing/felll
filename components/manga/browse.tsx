"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Search, SlidersHorizontal, X } from "lucide-react";
import { Poster } from "@/components/poster";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { browseManga, getMangaTags, type BrowseParams, type MangaCard, type MangaTag } from "@/lib/manga";
import { cn } from "@/lib/utils";

interface Reading { manga_id: string; chapter_id: string; chapter_num: string; page: number; title: string; cover: string | null }
const LIMIT = 36;
const YEARS = Array.from({ length: new Date().getUTCFullYear() - 1969 }, (_, i) => new Date().getUTCFullYear() - i);

function Card({ m }: { m: MangaCard }) {
  return (
    <Link href={`/manga/${m.id}`} className="group flex flex-col gap-1.5">
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-1.5 border-line shadow-poster transition group-hover:-translate-y-1 group-hover:border-frost-hot">
        <Poster src={m.cover} className="size-full" />
      </div>
      <div className="line-clamp-2 text-[13px] font-extrabold leading-tight">{m.title}</div>
    </Link>
  );
}

export function MangaBrowse() {
  const [q, setQ] = useState("");
  const [f, setF] = useState<Omit<BrowseParams, "q" | "limit" | "offset">>({});
  const [items, setItems] = useState<MangaCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);
  const [tags, setTags] = useState<MangaTag[]>([]);
  const [reading, setReading] = useState<Reading[]>([]);
  const offset = useRef(0);
  const qTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reqId = useRef(0);

  useEffect(() => { getMangaTags().then(setTags).catch(() => {}); fetch("/api/manga-progress").then((r) => (r.ok ? r.json() : null)).then((d) => setReading(d?.reading ?? [])).catch(() => {}); }, []);

  const load = useCallback(async (params: BrowseParams, append: boolean) => {
    const id = ++reqId.current;
    if (!append) setItems(null);
    try {
      const { items: got, total: t } = await browseManga({ ...params, limit: LIMIT, offset: append ? offset.current : 0 });
      if (id !== reqId.current) return; // a newer query won
      offset.current = (append ? offset.current : 0) + got.length;
      setTotal(t);
      // MangaDex's popularity ordering can repeat a title across pages; dedupe on
      // append so we don't render duplicate cards (React key collisions).
      setItems((prev) => {
        if (!append || !prev) return got;
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...got.filter((x) => !seen.has(x.id))];
      });
    } catch {
      if (id === reqId.current) setItems((prev) => (append ? prev : []));
    }
  }, []);

  // refetch on filter change (q debounced)
  useEffect(() => {
    clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => load({ q, ...f }, false), q.trim() ? 350 : 0);
    return () => clearTimeout(qTimer.current);
  }, [q, f, load]);

  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));
  const active = Object.values(f).filter(Boolean).length + (q.trim() ? 1 : 0);

  const pick = (key: keyof typeof f, placeholder: string, opts: { value: string; label: string }[]) => (
    <Select value={f[key] ?? "any"} onValueChange={(v) => set({ [key]: v === "any" ? undefined : v })}>
      <SelectTrigger aria-label={placeholder} className={cn(f[key] && "border-frost-hot bg-cream-blush text-frost-deep")}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="max-h-[320px] overflow-y-auto">
        <SelectItem value="any">{placeholder}: any</SelectItem>
        {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-plum-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every manga…" aria-label="Search manga"
          className="h-14 w-full rounded-full border-1.5 border-line bg-cream-card pl-14 pr-14 text-[16px] font-semibold outline-none transition focus:border-frost-hot focus:shadow-halo" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="ml-1 size-4 text-plum-muted" />
        {pick("tag", "Genre", tags.map((t) => ({ value: t.id, label: t.name })))}
        {pick("status", "Status", [["ongoing", "Ongoing"], ["completed", "Completed"], ["hiatus", "Hiatus"], ["cancelled", "Cancelled"]].map(([value, label]) => ({ value, label })))}
        {pick("demographic", "Demographic", [["shounen", "Shounen"], ["shoujo", "Shoujo"], ["seinen", "Seinen"], ["josei", "Josei"]].map(([value, label]) => ({ value, label })))}
        {pick("year", "Year", YEARS.map((y) => ({ value: String(y), label: String(y) })))}
        <span className="flex-1" />
        {pick("order", "Sort", [["popular", "Most popular"], ["rating", "Top rated"], ["latest", "Latest"], ["newest", "Newest"], ["title", "A–Z"]].map(([value, label]) => ({ value, label })))}
        {active > 0 && (
          <button type="button" onClick={() => { setQ(""); setF({}); }} className="flex h-[42px] items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-plum-muted hover:text-frost-text">
            <X className="size-3.5" strokeWidth={2.8} /> Clear {active}
          </button>
        )}
      </div>

      {!q && active === 0 && reading.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="eyebrow flex items-center gap-1.5"><BookOpen className="size-3.5" />Continue reading</div>
          <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
            {reading.map((r) => (
              <Link key={r.manga_id} href={`/manga/${r.manga_id}/${r.chapter_id}`} className="group w-[128px] flex-none">
                <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-1.5 border-line transition group-hover:-translate-y-1">
                  <Poster src={r.cover} className="size-full" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 py-1.5 text-[11px] font-extrabold text-white">Ch. {r.chapter_num || "?"} · p{r.page + 1}</span>
                </div>
                <div className="mt-1 line-clamp-1 text-[12px] font-bold">{r.title}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <div className="eyebrow">{q.trim() || active ? "Results" : "Popular now"}</div>
          {items && <div className="text-[12.5px] font-semibold text-plum-muted">{items.length.toLocaleString()} of {total.toLocaleString()}</div>}
        </div>
        {items === null ? (
          <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-cream-card" />)}
          </div>
        ) : items.length ? (
          <>
            <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4 lg:grid-cols-6">{items.map((m) => <Card key={m.id} m={m} />)}</div>
            {items.length < total && (
              <button type="button" disabled={more}
                onClick={async () => { setMore(true); await load({ q, ...f }, true); setMore(false); }}
                className="mx-auto mt-2 flex items-center gap-2 rounded-full border-1.5 border-line bg-cream-card px-6 py-3 text-[14px] font-bold text-frost-text hover:border-frost-hot disabled:opacity-60">
                {more ? "Loading…" : `Load more · ${(total - items.length).toLocaleString()} left`}
              </button>
            )}
          </>
        ) : (
          <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">Nothing matches that. Loosen a filter?</p>
        )}
      </section>
    </div>
  );
}
