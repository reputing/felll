import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { AgeGate } from "@/components/sources/age-gate";
import { SourceDetail } from "@/components/sources/detail";
import { SOURCES, isSourceId } from "@/lib/manga-sources";

export const metadata = { title: "Read" };

export default async function SourceDetailPage({ params }: { params: Promise<{ source: string; slug: string }> }) {
  const { source, slug } = await params;
  if (!isSourceId(source)) notFound();
  await requireMember(`/read/${source}/${slug}`);
  const meta = SOURCES[source];
  const content = (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <SourceDetail source={source} slug={decodeURIComponent(slug)} />
    </div>
  );
  return meta.adult ? <AgeGate sourceName={meta.name}>{content}</AgeGate> : content;
}
