import { AppLink as Link } from "@/components/AppLink";
import { SITE_NAME } from "./Header";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted">
        <p>
          © {new Date().getFullYear()} {SITE_NAME}. Catalog data from{" "}
          <a href="https://anilist.co" className="underline">AniList</a>.
        </p>
        <nav className="flex gap-4">
          <Link href="/search">Browse</Link>
          <Link href="/schedule">Schedule</Link>
        </nav>
      </div>
    </footer>
  );
}
