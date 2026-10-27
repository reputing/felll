import { currentUser, requireMember } from "@/lib/auth";
import { ShhChat } from "@/components/shh/chat";

// Browser-tab title = the member's chosen label, with NO "· cupcake.gg" suffix,
// so the tab doesn't give it away. `absolute` overrides the site title template.
export async function generateMetadata() {
  const u = await currentUser();
  const label = (u?.shh_label && u.shh_label.trim()) || "shh";
  return { title: { absolute: label } };
}

export default async function ShhPage() {
  await requireMember("/shh");
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-3 pb-6 pt-4 sm:px-5">
      <ShhChat />
    </div>
  );
}
