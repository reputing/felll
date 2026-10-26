import { requireMember } from "@/lib/auth";
import { PageHead } from "@/components/page-head";
import { CollectionsManager } from "@/components/collections/manager";

export const metadata = { title: "Collections" };

export default async function CollectionsPage() {
  await requireMember("/collections");
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="Cupcake / lists" title="Collections" sub="Your lists — mix anime and manga, keep them private or share." />
      <CollectionsManager />
    </div>
  );
}
