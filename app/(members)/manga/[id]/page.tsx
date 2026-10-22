import { requireMember } from "@/lib/auth";
import { MangaDetail } from "@/components/manga/detail";

export const metadata = { title: "Manga" };

export default async function MangaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMember(`/manga/${id}`);
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <MangaDetail id={id} />
    </div>
  );
}
