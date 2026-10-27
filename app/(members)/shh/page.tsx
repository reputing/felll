import { requireMember } from "@/lib/auth";
import { ShhChat } from "@/components/shh/chat";

export const metadata = { title: "shh" };

export default async function ShhPage() {
  await requireMember("/shh");
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-3 pb-6 pt-4 sm:px-5">
      <ShhChat />
    </div>
  );
}
