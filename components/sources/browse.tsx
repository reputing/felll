"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Poster } from "@/components/poster";
import { listSource, searchSource, SOURCES, type SourceId, type SrcCard } from "@/lib/manga-sources";

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
  // Some sources (nhentai/doujin) have no plain listing — start them empty and
  // only load once the viewer searches, rather than showing a broken grid.
  const searchFirst = !!SOURCES[source].searchFirst;
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SrcCard[] | null>(searchFirst ? [] : null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [end, setEnd] = useState(false);
  const qTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reqId = useRef(0);

  const load = useCallback(async (query: string, p: number, append: boolean) => {
    const id = ++reqId.current;
    if (!append) setItems(null);
    const got = await (query.trim() ? searchSource(source, query, p) : listSource(source, p)).catch(() => []);
    if (id !== reqId.current) return;
    setEnd(got.length === 0);
    setItems((prev) => (append && prev ? [...prev, ...got] : got));
  }, [source]);

  useEffect(() => {
    clearTimeout(qTimer.current);
    setPage(1);
    // Search-first sources: an empty query shows the prompt, no request.
    if (searchFirst && !q.trim()) { setItems([]); setEnd(true); return; }
    qTimer.current = setTimeout(() => load(q, 1, false), q.trim() ? 350 : 0);
    return () => clearTimeout(qTimer.current);
  }, [q, load, searchFirst]);

  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-plum-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${SOURCES[source].name}…`} aria-label="Search"
          className="h-14 w-full rounded-full border-1.5 border-line bg-cream-card pl-14 pr-6 text-[16px] font-semibold outline-none transition focus:border-frost-hot focus:shadow-halo" />
      </div>

      <section className="flex flex-col gap-3">
        <div className="eyebrow px-1">{q.trim() ? "Results" : searchFirst ? "Search" : "Latest"}</div>
        {items === null ? (
          <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-cream-card" />)}
          </div>
        ) : items.length ? (
          <>
            <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4 lg:grid-cols-6">{items.map((m) => <Card key={m.slug} source={source} m={m} />)}</div>
            {!end && (
              <button type="button" disabled={more}
                onClick={async () => { setMore(true); const np = page + 1; setPage(np); await load(q, np, true); setMore(false); }}
                className="mx-auto mt-2 flex items-center gap-2 rounded-full border-1.5 border-line bg-cream-card px-6 py-3 text-[14px] font-bold text-frost-text hover:border-frost-hot disabled:opacity-60">
                {more ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        ) : (
          <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">
            {q.trim()
              ? "Nothing matches that."
              : searchFirst
                ? `Search ${SOURCES[source].name} to begin.`
                : `No titles yet — ${SOURCES[source].name} may not be deployed/enabled. See MANGA-PROVIDERS.md.`}
          </p>
        )}
      </section>
    </div>
  );
}
