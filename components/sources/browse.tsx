"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Poster } from "@/components/poster";
import { listSource, searchSource, SOURCES, type SourceId, type SrcCard } from "@/lib/manga-sources";
import { cn } from "@/lib/utils";

function Card({ source, m }: { source: SourceId; m: SrcCard }) {
  return (
    <Link href={`/read/${source}/${encodeURIComponent(m.slug)}`} className="group flex flex-col gap-1.5">
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-1.5 border-line shadow-poster transition group-hover:-translate-y-1 group-hover:border-frost-hot">
        <Poster src={m.cover} className="size-full" />
      </div>
      <div className="line-clamp-2 text-[13px] font-extrabold leading-tight">{m.title}</div>
    </Link>
  );
}

export function SourceBrowse({ source }: { source: SourceId }) {
  const meta = SOURCES[source];
  const [q, setQ] = useState("");
  // Sort tabs (doujin: popular / trending / new). Undefined for sources without them.
  const [sort, setSort] = useState<string | undefined>(meta.sorts?.[0]?.param);
  const [items, setItems] = useState<SrcCard[] | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [end, setEnd] = useState(false);
  const qTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reqId = useRef(0);

  const load = useCallback(async (query: string, p: number, append: boolean, srt?: string) => {
    const id = ++reqId.current;
    if (!append) setItems(null);
    const got = await (query.trim() ? searchSource(source, query, p, srt) : listSource(source, p, srt)).catch(() => []);
    if (id !== reqId.current) return;
    setEnd(got.length === 0);
    setItems((prev) => (append && prev ? [...prev, ...got] : got));
  }, [source]);

  useEffect(() => {
    clearTimeout(qTimer.current);
    setPage(1);
    qTimer.current = setTimeout(() => load(q, 1, false, sort), q.trim() ? 350 : 0);
    return () => clearTimeout(qTimer.current);
  }, [q, sort, load]);

  const heading = q.trim() ? "Results" : meta.sorts?.find((s) => s.param === sort)?.label ?? "Latest";

  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-plum-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${meta.name}…`} aria-label="Search"
          className="h-14 w-full rounded-full border-1.5 border-line bg-cream-card pl-14 pr-6 text-[16px] font-semibold outline-none transition focus:border-frost-hot focus:shadow-halo" />
      </div>

      {meta.sorts && (
        <div className="flex flex-wrap items-center gap-2">
          {meta.sorts.map((s) => (
            <button key={s.param} type="button" onClick={() => setSort(s.param)} aria-pressed={sort === s.param}
              className={cn("h-9 rounded-full border-1.5 px-4 text-[13px] font-extrabold transition",
                sort === s.param ? "border-frost-hot bg-cream-blush text-frost-deep" : "border-line text-plum-muted hover:border-frost-hot")}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {meta.tags && (
        <div className="scrollbar-none -mt-1 flex gap-2 overflow-x-auto pb-1">
          {meta.tags.map((t) => (
            <button key={t} type="button" onClick={() => setQ(t === q ? "" : t)} aria-pressed={q === t}
              className={cn("h-8 flex-none rounded-full border-1.5 px-3 text-[12.5px] font-bold transition",
                q === t ? "border-frost-hot bg-cream-blush text-frost-deep" : "border-line text-plum-muted hover:border-frost-hot")}>
              {t}
            </button>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="eyebrow px-1">{heading}</div>
        {items === null ? (
          <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-cream-card" />)}
          </div>
        ) : items.length ? (
          <>
            <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4 lg:grid-cols-6">{items.map((m) => <Card key={m.slug} source={source} m={m} />)}</div>
            {!end && (
              <button type="button" disabled={more}
                onClick={async () => { setMore(true); const np = page + 1; setPage(np); await load(q, np, true, sort); setMore(false); }}
                className="mx-auto mt-2 flex items-center gap-2 rounded-full border-1.5 border-line bg-cream-card px-6 py-3 text-[14px] font-bold text-frost-text hover:border-frost-hot disabled:opacity-60">
                {more ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        ) : (
          <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">
            {q.trim() ? "Nothing matches that." : `No titles yet — ${meta.name} may not be deployed/enabled. See MANGA-PROVIDERS.md.`}
          </p>
        )}
      </section>
    </div>
  );
}
