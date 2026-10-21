import Link from "next/link";
import { AnimeGrid } from "@/components/AnimeCard";
import { getFilterValues, searchAnime } from "@/lib/catalog";
import { getTitleLanguage } from "@/lib/titles";
import type { Format, SearchFilters, Season, Status } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

const PAGE_SIZE = 24;

const SEASONS: [Season, string][] = [["WINTER", "Winter"], ["SPRING", "Spring"], ["SUMMER", "Summer"], ["FALL", "Fall"]];
const FORMATS: [Format, string][] = [["TV", "TV"], ["MOVIE", "Movie"], ["SPECIAL", "Special"], ["OVA", "OVA"], ["ONA", "ONA"], ["MUSIC", "Music"]];
const STATUSES: [Status, string][] = [["FINISHED", "Finished"], ["RELEASING", "Releasing"], ["NOT_YET_RELEASED", "Not Yet Released"], ["CANCELLED", "Cancelled"]];
const ORIGINS: [string, string][] = [["JP", "Japan"], ["KR", "South Korea"], ["CN", "China"], ["TW", "Taiwan"]];
const AUDIO: [string, string][] = [["sub", "Sub"], ["dub", "Dub"], ["both", "Sub & Dub"]];
const RATINGS = ["G", "PG", "PG-13", "R", "R+"];
const SORTS: [string, string][] = [
  ["", "Best match"],
  ["popularity", "Popularity"],
  ["trending", "Trending"],
  ["score", "Score"],
  ["year", "Year"],
  ["updated", "Recently updated"],
  ["title", "Title A–Z"],
];

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const many = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : v ? v.split(",") : []).map((s) => s.trim()).filter(Boolean);

function parseFilters(p: Params): SearchFilters {
  const year = Number(one(p.year));
  const page = Number(one(p.page));
  return {
    // "keyword" is accepted as an alias so old links keep working.
    q: one(p.q) ?? one(p.keyword),
    genres: many(p.genres),
    tags: many(p.tags),
    year: Number.isInteger(year) && year > 0 ? year : undefined,
    season: one(p.season) as Season | undefined,
    format: one(p.format) as Format | undefined,
    status: one(p.status) as Status | undefined,
    origin: one(p.origin),
    audio: one(p.audio) as SearchFilters["audio"],
    rating: one(p.rating),
    studio: one(p.studio),
    character: one(p.character),
    staff: one(p.staff),
    sort: one(p.sort),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: PAGE_SIZE,
  };
}

function pageHref(p: Params, page: number): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (k === "page" || v == null) continue;
    for (const item of Array.isArray(v) ? v : [v]) params.append(k, item);
  }
  params.set("page", String(page));
  return `/search?${params}`;
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <select name={name} defaultValue={value ?? ""} className="rounded-md border border-line bg-panel px-2 py-2 text-sm text-white">
        <option value="">Any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

function TextFilter({ name, label, value, placeholder }: { name: string; label: string; value?: string; placeholder: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input name={name} defaultValue={value} placeholder={placeholder} className="rounded-md border border-line bg-panel px-2 py-2 text-sm text-white" />
    </label>
  );
}

function CheckList({ name, label, values, selected }: { name: string; label: string; values: string[]; selected: string[] }) {
  return (
    <details className="rounded-md border border-line bg-panel" open={selected.length > 0}>
      <summary className="cursor-pointer px-3 py-2 text-sm">
        {label}
        {selected.length > 0 && <span className="text-accent"> · {selected.join(", ")}</span>}
      </summary>
      <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto p-3 text-sm sm:grid-cols-4 lg:grid-cols-6">
        {values.map((v) => (
          <label key={v} className="flex items-center gap-2">
            <input type="checkbox" name={name} value={v} defaultChecked={selected.includes(v)} />
            {v}
          </label>
        ))}
      </div>
    </details>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const f = parseFilters(params);
  const lang = await getTitleLanguage();
  const [{ results, total }, values] = await Promise.all([searchAnime(f), getFilterValues()]);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = f.page ?? 1;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{f.q ? `Results for “${f.q}”` : "Browse anime"}</h1>

      <form action="/search" className="space-y-3">
        <input
          name="q"
          type="search"
          defaultValue={f.q}
          placeholder="Title, English or Japanese, typos welcome"
          className="w-full rounded-lg border border-line bg-panel px-4 py-3"
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Select name="year" label="Year" value={f.year?.toString()} options={values.years.map((y) => [String(y), String(y)])} />
          <Select name="season" label="Season" value={f.season} options={SEASONS} />
          <Select name="format" label="Format" value={f.format} options={FORMATS} />
          <Select name="status" label="Status" value={f.status} options={STATUSES} />
          <Select name="origin" label="Origin" value={f.origin} options={ORIGINS} />
          <Select name="audio" label="Audio" value={f.audio} options={AUDIO} />
          <Select name="rating" label="Rating" value={f.rating} options={RATINGS.map((r) => [r, r])} />
          <TextFilter name="studio" label="Studio" value={f.studio} placeholder="e.g. MAPPA" />
          <TextFilter name="character" label="Character" value={f.character} placeholder="e.g. Frieren" />
          <TextFilter name="staff" label="Staff" value={f.staff} placeholder="e.g. Hayao Miyazaki" />
          <label className="flex flex-col gap-1 text-xs text-muted">
            Sort by
            <select name="sort" defaultValue={f.sort ?? ""} className="rounded-md border border-line bg-panel px-2 py-2 text-sm text-white">
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button className="flex-1 rounded-md bg-accent py-2 font-semibold text-black">Filter</button>
            <Link href="/search" className="rounded-md border border-line px-3 py-2 text-sm">Reset</Link>
          </div>
        </div>
        <CheckList name="genres" label="Genres" values={values.genres} selected={f.genres ?? []} />
        <CheckList name="tags" label="Tags" values={values.tags} selected={f.tags ?? []} />
      </form>

      <p className="text-sm text-muted">{total.toLocaleString()} results found</p>
      {results.length > 0 ? <AnimeGrid items={results} lang={lang} /> : <p className="py-16 text-center text-muted">No anime match these filters.</p>}

      {lastPage > 1 && (
        <nav className="flex items-center justify-center gap-2 text-sm" aria-label="Pagination">
          {page > 1 && <Link href={pageHref(params, page - 1)} className="rounded-md border border-line px-3 py-1.5">Previous</Link>}
          {[1, page - 1, page, page + 1, lastPage]
            .filter((n, i, all) => n >= 1 && n <= lastPage && all.indexOf(n) === i)
            .sort((a, b) => a - b)
            .map((n) => (
              <Link
                key={n}
                href={pageHref(params, n)}
                aria-current={n === page ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 ${n === page ? "bg-accent text-black" : "border border-line"}`}
              >
                {n}
              </Link>
            ))}
          {page < lastPage && <Link href={pageHref(params, page + 1)} className="rounded-md border border-line px-3 py-1.5">Next</Link>}
        </nav>
      )}
    </div>
  );
}
