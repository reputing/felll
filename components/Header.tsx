import Link from "next/link";
import { getTitleLanguage } from "@/lib/titles";
import { SearchBox } from "./SearchBox";
import { TitleLanguageToggle } from "./TitleLanguageToggle";

export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "Cupcake";

export async function Header() {
  const lang = await getTitleLanguage();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/home" className="shrink-0 text-xl font-bold text-accent">
          {SITE_NAME}
        </Link>
        <nav className="hidden gap-4 text-sm text-muted md:flex">
          <Link href="/home" className="hover:text-white">Home</Link>
          <Link href="/search" className="hover:text-white">Browse</Link>
          <Link href="/schedule" className="hover:text-white">Schedule</Link>
        </nav>
        <div className="ml-auto w-full max-w-md">
          <SearchBox />
        </div>
        <TitleLanguageToggle current={lang} />
      </div>
    </header>
  );
}
