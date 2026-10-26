import Link from "next/link";
import { History } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { PageHead } from "@/components/page-head";
import { MangaBrowse } from "@/components/manga/browse";
import { MangaLibraryRail } from "@/components/manga/library-rail";
import { MoreSources } from "@/components/sources/more-sources";

export const metadata = { title: "Manga" };

export default async function MangaPage() {
  await requireMember("/manga");
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="Cupcake / read" title="Manga" sub="Every series, every chapter, read right here.">
        <Link href="/manga/history" className="flex h-10 items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold text-plum-body hover:border-frost-hot"><History className="size-4" />History</Link>
      </PageHead>
      <MangaLibraryRail />
      <MangaBrowse />
      <MoreSources />
    </div>
  );
}
