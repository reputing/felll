import { requireMember } from "@/lib/auth";
import { CollectionDetail } from "@/components/collections/detail";

export const metadata = { title: "List" };

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMember(`/collections/${id}`);
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <CollectionDetail id={id} />
    </div>
  );
}
