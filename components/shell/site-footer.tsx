import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-10 border-t-1.5 border-line bg-cream-card/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-7 pb-7 pt-[22px] text-[12.5px] font-semibold text-plum-muted">
        <span className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cupcake.png" alt="" width={28} height={28} className="size-7" />
          <span className="text-base font-extrabold tracking-[-.5px] text-frost-brand">cupcake<span className="text-plum-faint">.gg</span></span>
          <span className="text-plum-faint">· a kuro place</span>
        </span>
        <nav aria-label="footer" className="flex flex-wrap items-center gap-[18px]">
          <Link href="/requests" className="text-frost-text hover:text-frost-deep">Requests</Link>
          <Link href="/community" className="text-frost-text hover:text-frost-deep">Members</Link>
          <Link href="/schedule" className="text-frost-text hover:text-frost-deep">Schedule</Link>
          <Link href="/privacy" className="text-frost-text hover:text-frost-deep">Privacy</Link>
          <Link href="/terms" className="text-frost-text hover:text-frost-deep">Terms</Link>
          <a href="https://kuro.rip" className="text-frost-text hover:text-frost-deep">kuro.rip</a>
          <a href="/nekuro" className="flex items-center gap-1.5 rounded-full border-1.5 border-line bg-paper px-3 py-1.5 font-bold text-frost-text hover:border-frost-hot">
            <svg aria-hidden viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.5a14.6 14.6 0 0 1 4.3 1.3 16.6 16.6 0 0 0-14.9 0A14.6 14.6 0 0 1 8.9 3.5L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.6 9 .1 13.4.3 17.8a19.9 19.9 0 0 0 6 3l.8-1.2a12.8 12.8 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4a12.8 12.8 0 0 1-2 1l.8 1.2a19.9 19.9 0 0 0 6-3c.4-5.1-.5-9.5-2.6-13.4ZM8.4 15.3c-1.2 0-2.1-1.1-2.1-2.4S7.2 10.5 8.4 10.5s2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Zm7.2 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Z"/></svg>
            Discord
          </a>
        </nav>
        <span className="font-mono text-[11.5px]">metadata via AniList · Kitsu</span>
      </div>
    </footer>
  );
}
