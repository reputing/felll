import { requireMember } from "@/lib/auth";
import { MangaReader } from "@/components/manga/reader";

export const metadata = { title: "Reading" };

export default async function ReadPage({ params }: { params: Promise<{ id: string; chapter: string }> }) {
  const { id, chapter } = await params;
  await requireMember(`/manga/${id}/${chapter}`);
  return <MangaReader mangaId={id} chapterId={chapter} />;
}
