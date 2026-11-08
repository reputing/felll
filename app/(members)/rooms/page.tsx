import { requireMember } from "@/lib/auth";
import { PageHead } from "@/components/page-head";
import { RoomsLobby } from "@/components/rooms/lobby";

export const metadata = { title: "Watch rooms" };

export default async function Rooms() {
  await requireMember("/rooms");
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="Cupcake / together" title="Watch rooms" sub="Public rooms that are playing right now. Hop in and you're synced to the host." />
      <RoomsLobby />
    </div>
  );
}
