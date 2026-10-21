import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-10 border-t-1.5 border-line bg-cream-card">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-7 pb-7 pt-[22px] text-[12.5px] font-semibold text-plum-muted">
        <span className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.png" alt="" width={28} height={28} className="rounded-lg bg-paper" />
          <span className="text-base font-extrabold tracking-[-.5px] text-frost-brand">cupcake<span className="text-plum-faint">.gg</span></span>
          <span className="text-plum-faint">· a kuro place</span>
        </span>
        <nav aria-label="footer" className="flex flex-wrap gap-[18px]">
          <Link href="/requests" className="text-frost-text hover:text-frost-deep">Requests</Link>
          <Link href="/community" className="text-frost-text hover:text-frost-deep">Members</Link>
          <Link href="/schedule" className="text-frost-text hover:text-frost-deep">Schedule</Link>
          <a href="https://kuro.rip" className="text-frost-text hover:text-frost-deep">kuro.rip</a>
        </nav>
        <span className="font-mono text-[11.5px]">metadata via Jikan · MyAnimeList</span>
      </div>
    </footer>
  );
}
