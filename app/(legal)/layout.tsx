import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteFooter } from "@/components/shell/site-footer";

// Public legal pages — no membership required, minimal chrome.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b-1.5 border-line bg-cream-card/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[820px] items-center justify-between px-6 py-3">
          <Link href="/home" aria-label="cupcake.gg home" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cupcake.png" alt="" width={34} height={34} className="size-8" />
            <span className="text-[20px] font-extrabold tracking-[-.6px] text-frost-brand">cupcake<span className="font-bold text-plum-faint">.gg</span></span>
          </Link>
          <Link href="/home" className="flex items-center gap-1.5 text-[13px] font-bold text-frost-text hover:text-frost-deep">
            <ArrowLeft className="size-4" /> Back to cupcake
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
