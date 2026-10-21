"use client";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface Option { value: string; label: string }

/** URL-driven filters: every change is a navigation, so results are shareable and server-rendered. */
export function Filters({ genres, years }: { genres: string[]; years: number[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const push = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    next.delete("page");
    start(() => router.push(`${path}?${next}`, { scroll: false }));
  };

  useEffect(() => {
    if ((sp.get("q") ?? "") === q) return;
    const t = setTimeout(() => push({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (key: string, placeholder: string, opts: Option[]) => (
    <Select value={sp.get(key) ?? "any"} onValueChange={(v) => push({ [key]: v === "any" ? null : v })}>
      <SelectTrigger aria-label={placeholder} className={cn(sp.get(key) && "border-frost-hot bg-cream-blush text-frost-deep")}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="max-h-[320px] overflow-y-auto">
        <SelectItem value="any">{placeholder}: any</SelectItem>
        {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const active = ["q", "type", "status", "genre", "year", "rating"].filter((k) => sp.get(k));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-plum-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every anime on MyAnimeList…" aria-label="Search"
          className="h-14 w-full rounded-full border-1.5 border-line bg-cream-card pl-14 pr-14 text-[16px] font-semibold outline-none transition focus:border-frost-hot focus:shadow-halo" />
        {pending && <span className="absolute right-5 top-1/2 size-5 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-frost-hot" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="ml-1 size-4 text-plum-muted" />
        {pick("type", "Format", [["tv", "TV"], ["movie", "Film"], ["ova", "OVA"], ["ona", "ONA"], ["special", "Special"], ["tv_special", "TV special"]].map(([value, label]) => ({ value, label })))}
        {pick("status", "Status", [["airing", "Airing"], ["complete", "Finished"], ["upcoming", "Upcoming"]].map(([value, label]) => ({ value, label })))}
        {pick("genre", "Genre", genres.map((g) => ({ value: g, label: g })))}
        {pick("year", "Year", years.map((y) => ({ value: String(y), label: String(y) })))}
        {pick("rating", "Age", [["g", "All ages"], ["pg", "Children"], ["pg13", "Teens 13+"], ["r17", "17+"]].map(([value, label]) => ({ value, label })))}
        <span className="flex-1" />
        {pick("order", "Sort", [["members", "Most popular"], ["score", "Top rated"], ["start_date", "Newest"], ["favorites", "Most loved"], ["title", "A–Z"]].map(([value, label]) => ({ value, label })))}
        {active.length > 0 && (
          <button type="button" onClick={() => { setQ(""); start(() => router.push(path)); }} className="flex h-[42px] items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-plum-muted hover:text-frost-text">
            <X className="size-3.5" strokeWidth={2.8} /> Clear {active.length}
          </button>
        )}
      </div>
    </div>
  );
}
