import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { SITE_NAME } from "@/components/Header";
import { searchAnime } from "@/lib/catalog";
import { displayTitle, getTitleLanguage } from "@/lib/titles";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const lang = await getTitleLanguage();
  const { results: popular } = await searchAnime({ sort: "trending", pageSize: 5 });

  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-16 text-center">
      <h1 className="text-4xl font-bold sm:text-5xl">
        <span className="text-accent">{SITE_NAME}</span> anime streaming
      </h1>
      <p className="text-muted">Find a show in a keystroke. Watch it in HD, subbed or dubbed.</p>
      <SearchBox autoFocus large />
      {popular.length > 0 && (
        <p className="flex flex-wrap justify-center gap-2 text-sm text-muted">
          Trending:
          {popular.map((a) => (
            <Link key={a.id} href={`/anime/${a.slug}`} className="text-white hover:text-accent">
              {displayTitle(a, lang)}
            </Link>
          ))}
        </p>
      )}
      <div className="flex gap-3">
        <Link href="/home" className="rounded-lg bg-accent px-5 py-2 font-semibold text-black">
          Start watching
        </Link>
        <Link href="/schedule" className="rounded-lg border border-line px-5 py-2">
          Airing schedule
        </Link>
      </div>
    </section>
  );
}
