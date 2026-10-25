import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { PageHead } from "@/components/page-head";
import { AgeGate } from "@/components/sources/age-gate";
import { SourceBrowse } from "@/components/sources/browse";
import { SOURCES, isSourceId } from "@/lib/manga-sources";

export async function generateMetadata({ params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  return { title: isSourceId(source) ? SOURCES[source].name : "Read" };
}

export default async function SourceBrowsePage({ params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  if (!isSourceId(source)) notFound();
  await requireMember(`/read/${source}`);
  const meta = SOURCES[source];
  const content = (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow={`Cupcake / ${meta.name.toLowerCase()}`} title={meta.name} sub={meta.blurb} />
      <SourceBrowse source={source} />
    </div>
  );
  return meta.adult ? <AgeGate sourceName={meta.name}>{content}</AgeGate> : content;
}
