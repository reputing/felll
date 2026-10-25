import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { AgeGate } from "@/components/sources/age-gate";
import { SourceReader } from "@/components/sources/reader";
import { SOURCES, isSourceId } from "@/lib/manga-sources";

export const metadata = { title: "Reading" };

export default async function SourceReadPage({ params }: { params: Promise<{ source: string; slug: string; chapter: string }> }) {
  const { source, slug, chapter } = await params;
  if (!isSourceId(source)) notFound();
  await requireMember(`/read/${source}/${slug}/${chapter}`);
  const meta = SOURCES[source];
  const reader = <SourceReader source={source} slug={decodeURIComponent(slug)} chapter={decodeURIComponent(chapter)} />;
  return meta.adult ? <AgeGate sourceName={meta.name}>{reader}</AgeGate> : reader;
}
