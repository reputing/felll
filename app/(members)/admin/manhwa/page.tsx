import { notFound } from "next/navigation";
import { isAdmin, requireMember } from "@/lib/auth";
import { PageHead } from "@/components/page-head";
import { AdultAccessAdmin } from "@/components/admin/adult-access";

export const metadata = { title: "18+ access" };

export default async function AdultAccessPage() {
  const user = await requireMember("/admin/manhwa");
  if (!(await isAdmin(user))) notFound();
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="Cupcake / admin" title="18+ access" sub="Approve members to see 18+ manga in the reader (the 18+ toggle on the manga page)." />
      <AdultAccessAdmin />
    </div>
  );
}
