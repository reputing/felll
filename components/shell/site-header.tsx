"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Search } from "lucide-react";
import { SaveIcon } from "@/components/icons";
import { POPUP, POPUP_ITEM } from "@/components/ui/popup";
import { set, useBox } from "@/lib/store";
import { cn, pad2 } from "@/lib/utils";
import { OnlinePill } from "./online-pill";
import { NotificationsBell } from "./notifications";
import { UserMenu, type MenuUser } from "./user-menu";

// A few primary links up top; the rest tuck into a "More" menu so the bar
// stays uncluttered as new sections (manga, movies) arrive.
const PRIMARY = [
  { href: "/home", label: "Explore" },
  { href: "/browse", label: "Browse" },
  { href: "/manga", label: "Manga" },
  { href: "/movies", label: "Movies" },
];
const MORE = [
  { href: "/schedule", label: "Schedule" },
  { href: "/seasonal", label: "Seasonal" },
  { href: "/rankings", label: "Rankings" },
  { href: "/community", label: "Community" },
];
const ALL = [...PRIMARY, ...MORE];

export function SiteHeader({ user, unread }: { user: MenuUser; unread: number }) {
  const path = usePathname();
  const savedN = useBox((s) => Object.values(s.lib).filter((e) => e.status).length);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) {
        e.preventDefault();
        set({ palette: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("keydown", onKey); };
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-b from-cream from-75% to-transparent px-3 pt-2.5 sm:px-5">
      <div className={cn(
        "mx-auto flex max-w-[1560px] items-center gap-3 rounded-shell border-1.5 border-line shadow-shell transition-all duration-300 sm:gap-4",
        scrolled
          ? "min-h-[56px] bg-cream-card/55 py-1.5 pl-5 pr-2.5 backdrop-blur-2xl backdrop-saturate-150 sm:pl-6"
          : "min-h-[72px] bg-cream-card/70 py-2.5 pl-5 pr-2.5 backdrop-blur-2xl backdrop-saturate-150 sm:pl-7",
      )}>
        <Link href="/home" aria-label="cupcake.gg home" className="flex flex-none items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cupcake.png" alt="" width={40} height={40} className="size-9 flex-none drop-shadow-[0_3px_8px_rgb(var(--glow)/.4)] transition-transform duration-300 hover:-rotate-6 hover:scale-105 sm:size-10" />
          <span className="hidden text-[23px] font-extrabold leading-none tracking-[-.6px] text-frost-brand sm:inline sm:text-[25px]">
            cupcake<span className="font-bold text-plum-faint">.gg</span>
          </span>
        </Link>
        <nav aria-label="main" className="ml-1 hidden items-center gap-0 lg:flex">
          {PRIMARY.map((n) => {
            const on = path === n.href || path.startsWith(n.href + "/");
            return (
              <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
                className={cn("relative flex h-11 items-center px-2.5 text-[14px] font-bold whitespace-nowrap text-plum-body transition-colors hover:text-plum", on && "text-frost-text after:absolute after:inset-x-2.5 after:bottom-0.5 after:h-[3px] after:rounded-full after:bg-frost-hot")}>
                {n.label}
              </Link>
            );
          })}
          <Menu.Root modal={false}>
            <Menu.Trigger className={cn("group flex h-11 items-center gap-1 px-2.5 text-[14px] font-bold text-plum-body outline-none transition-colors hover:text-plum", MORE.some((n) => path === n.href || path.startsWith(n.href + "/")) && "text-frost-text")}>
              More <ChevronDown className="size-4 transition group-data-[state=open]:rotate-180" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="start" sideOffset={8} className={cn(POPUP, "w-[180px]")}>
                {MORE.map((n) => {
                  const on = path === n.href || path.startsWith(n.href + "/");
                  return (
                    <Menu.Item key={n.href} asChild className={POPUP_ITEM}>
                      <Link href={n.href}><span className="flex-1">{n.label}</span>{on && <Check className="size-4" strokeWidth={3} />}</Link>
                    </Menu.Item>
                  );
                })}
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </nav>
        <div className="flex-1" />
        <button type="button" onClick={() => set({ palette: true })} className="group relative hidden h-11 min-w-[150px] flex-[0_1_300px] items-center overflow-hidden whitespace-nowrap rounded-full border-1.5 border-line bg-paper pl-[42px] pr-[60px] text-left text-sm font-medium text-plum-faint hover:border-frost-hot md:flex">
          <Search aria-hidden className="absolute left-4 size-[17px] text-plum-muted" strokeWidth={2.2} />
          <span className="truncate">Find your next watch…</span>
          <kbd className="absolute right-2.5 flex h-6 items-center rounded-[7px] border border-line bg-cream-tint px-[7px] font-mono text-[11.5px] text-plum-muted">⌘K</kbd>
        </button>
        <button type="button" onClick={() => set({ palette: true })} aria-label="Search" className="grid size-10 place-items-center rounded-full border-1.5 border-line bg-paper md:hidden">
          <Search className="size-[17px]" />
        </button>
        <OnlinePill />
        <Link href="/box" className="hidden h-11 items-center gap-2 px-1.5 font-bold hover:text-frost-text sm:flex">
          <SaveIcon on={savedN > 0} className="size-[17px]" /> <span className="hidden 2xl:inline">Saved</span> <span className="font-mono text-[12.5px] text-frost-text">{pad2(savedN)}</span>
        </Link>
        <span aria-hidden className="hidden h-7 w-[1.5px] bg-line sm:block" />
        <NotificationsBell unread={unread} />
        <UserMenu user={user} />
      </div>
      <nav aria-label="main" className="scrollbar-none mx-auto mt-2 flex max-w-[1560px] gap-1 overflow-x-auto lg:hidden">
        {ALL.map((n) => {
          const on = path === n.href || path.startsWith(n.href + "/");
          return (
            <Link key={n.href} href={n.href} className={cn("flex h-9 flex-none items-center rounded-full border-1.5 border-line bg-cream-card px-3.5 text-[13px] font-bold", on && "border-frost-hot bg-frost text-frost-ink")}>{n.label}</Link>
          );
        })}
      </nav>
    </header>
  );
}
