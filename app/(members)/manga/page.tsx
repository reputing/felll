import { requireMember } from "@/lib/auth";
import { PageHead } from "@/components/page-head";
import { MangaBrowse } from "@/components/manga/browse";
import { MangaLibraryRail } from "@/components/manga/library-rail";

export const metadata = { title: "Manga" };

export default async function MangaPage() {
  await requireMember("/manga");
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="Cupcake / read" title="Manga" sub="Every series, every chapter — read right here." />
      <MangaLibraryRail />
      <MangaBrowse />
    </div>
  );
}
