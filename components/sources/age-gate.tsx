import Link from "next/link";
import { ShieldAlert } from "lucide-react";

// Wraps an adult source. Access is admin-granted (users.adult_ok) and enforced
// server-side by the /api/manga-src proxy; this just shows the content to
// approved members and a "request access" message to everyone else. There is no
// self-confirmation — a member can't grant themselves 18+ access.
export function AgeGate({ approved, children }: { approved: boolean; children: React.ReactNode }) {
  if (approved) return <>{children}</>;
  return (
    <div className="mx-auto mt-8 flex max-w-[460px] flex-col items-center gap-4 rounded-shell border-1.5 border-line bg-cream-card p-8 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-cream-blush text-frost-text"><ShieldAlert className="size-7" /></div>
      <h2 className="text-xl font-extrabold tracking-[-.5px]">18+ access required</h2>
      <p className="text-[14px] font-medium text-plum-muted">This section contains adult manhwa. Access is granted by an admin — ask one to approve your account, then refresh.</p>
      <Link href="/manga" className="mt-1 grid h-11 w-full place-items-center rounded-full border-1.5 border-line font-bold text-plum-body hover:border-frost-hot">Back to manga</Link>
    </div>
  );
}
