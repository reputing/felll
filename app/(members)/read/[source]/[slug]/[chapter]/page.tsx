import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { AgeGate } from "@/components/sources/age-gate";
import { SourceReader } from "@/components/sources/reader";
import { SOURCES, isSourceId } from "@/lib/manga-sources";

export const metadata = { title: "Reading" };

export default async function SourceReadPage({ params }: { params: Promise<{ source: string; slug: string; chapter: string }> }) {
  const { source, slug, chapter } = await params;
  if (!isSourceId(source)) notFound();
  const user = await requireMember(`/read/${source}/${slug}/${chapter}`);
  const meta = SOURCES[source];
  const reader = <SourceReader source={source} slug={decodeURIComponent(slug)} chapter={decodeURIComponent(chapter)} />;
  return meta.adult ? <AgeGate approved={user.adult_ok === 1}>{reader}</AgeGate> : reader;
}
