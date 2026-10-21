import { AppLink as Link } from "@/components/AppLink";
import { AnimeGrid } from "@/components/AnimeCard";
import { searchAnime } from "@/lib/catalog";
import { getTitleLanguage } from "@/lib/titles";
import type { SearchFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

const SECTIONS: { title: string; filters: SearchFilters }[] = [
  { title: "Trending now", filters: { sort: "trending" } },
  { title: "Recently updated", filters: { sort: "updated", audio: "sub" } },
  { title: "Top airing", filters: { status: "RELEASING", sort: "popularity" } },
  { title: "All-time popular", filters: { sort: "popularity" } },
  { title: "Top rated", filters: { sort: "score" } },
  { title: "Upcoming", filters: { status: "NOT_YET_RELEASED", sort: "popularity" } },
];

function searchHref(f: SearchFilters): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v != null) params.set(k, String(v));
  return `/search?${params}`;
}

export default async function Home() {
  const lang = await getTitleLanguage();
  const rows = await Promise.all(SECTIONS.map((s) => searchAnime({ ...s.filters, pageSize: 12 })));

  return (
    <div className="space-y-12">
      {SECTIONS.map((section, i) =>
        rows[i].results.length === 0 ? null : (
          <section key={section.title}>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <Link href={searchHref(section.filters)} className="text-sm text-accent">
                View more
              </Link>
            </div>
            <AnimeGrid items={rows[i].results} lang={lang} />
          </section>
        ),
      )}
    </div>
  );
}
