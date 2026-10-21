"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Search } from "lucide-react";
import { SaveIcon } from "@/components/icons";
import { set, useBox } from "@/lib/store";
import { cn, pad2 } from "@/lib/utils";
import { OnlinePill } from "./online-pill";
import { NotificationsBell } from "./notifications";
import { UserMenu, type MenuUser } from "./user-menu";

const NAV = [
  { href: "/home", label: "Explore" },
  { href: "/browse", label: "Browse" },
  { href: "/seasonal", label: "Seasonal" },
  { href: "/schedule", label: "Schedule" },
  { href: "/rankings", label: "Rankings" },
  { href: "/community", label: "Community" },
];

export function SiteHeader({ user, unread }: { user: MenuUser; unread: number }) {
  const path = usePathname();
  const dub = useBox((s) => s.dub);
  const savedN = useBox((s) => Object.values(s.lib).filter((e) => e.status).length);

  useEffect(() => {
    try { set({ dub: localStorage.getItem("audio") === "dub" }); } catch {}
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) {
        e.preventDefault();
        set({ palette: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setDub = (v: boolean) => {
    set({ dub: v });
    try { localStorage.setItem("audio", v ? "dub" : "sub"); } catch {}
  };

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-b from-cream from-75% to-transparent px-3 pt-2.5 sm:px-5">
      <div className="mx-auto flex min-h-[72px] max-w-[1560px] items-center gap-3 rounded-shell border-1.5 border-line bg-cream-card/90 py-2.5 pl-5 pr-2.5 shadow-shell backdrop-blur-xl sm:gap-4 sm:pl-7">
        <Link href="/home" aria-label="cupcake.gg home" className="flex flex-none items-baseline text-[26px] font-extrabold leading-none tracking-[-1.2px] text-frost-brand sm:text-[30px]">
          cupcake<span className="text-xl font-semibold tracking-[-.5px] text-plum-faint sm:text-2xl">.gg</span>
        </Link>
        <nav aria-label="main" className="ml-1 hidden gap-0 lg:flex">
          {NAV.map((n) => {
            const on = path === n.href || path.startsWith(n.href + "/");
            return (
              <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
                className={cn("relative flex h-11 items-center px-2.5 text-[14px] font-bold whitespace-nowrap text-plum-body transition-colors hover:text-plum", on && "text-frost-text after:absolute after:inset-x-2.5 after:bottom-0.5 after:h-[3px] after:rounded-full after:bg-frost-hot")}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <button type="button" onClick={() => set({ palette: true })} className="group relative hidden h-11 min-w-[150px] flex-[0_1_300px] items-center overflow-hidden whitespace-nowrap rounded-full border-1.5 border-line bg-paper pl-[42px] pr-[60px] text-left text-sm font-medium text-plum-faint hover:border-frost-hot md:flex">
          <Search aria-hidden className="absolute left-4 size-[17px] text-plum-muted" strokeWidth={2.2} />
          <span className="truncate">Find your next anime…</span>
          <kbd className="absolute right-2.5 flex h-6 items-center rounded-[7px] border border-line bg-cream-tint px-[7px] font-mono text-[11.5px] text-plum-muted">⌘K</kbd>
        </button>
        <button type="button" onClick={() => set({ palette: true })} aria-label="Search" className="grid size-10 place-items-center rounded-full border-1.5 border-line bg-paper md:hidden">
          <Search className="size-[17px]" />
        </button>
        <div role="group" aria-label="audio language" className="hidden rounded-full border-1.5 border-line bg-cream-tint p-[3px] 2xl:flex">
          {[false, true].map((v) => (
            <button key={String(v)} type="button" aria-pressed={dub === v} onClick={() => setDub(v)}
              className={cn("h-8 rounded-full px-[13px] text-[12.5px] font-extrabold text-plum-muted", dub === v && "bg-paper text-frost-text shadow-[0_2px_6px_-2px_rgb(var(--glow)/.4)]")}>
              {v ? "Dub" : "Sub"}
            </button>
          ))}
        </div>
        <OnlinePill />
        <Link href="/box" className="hidden h-11 items-center gap-2 px-1.5 font-bold hover:text-frost-text sm:flex">
          <SaveIcon on={savedN > 0} className="size-[17px]" /> <span className="hidden 2xl:inline">Saved</span> <span className="font-mono text-[12.5px] text-frost-text">{pad2(savedN)}</span>
        </Link>
        <span aria-hidden className="hidden h-7 w-[1.5px] bg-line sm:block" />
        <NotificationsBell unread={unread} />
        <UserMenu user={user} />
      </div>
      <nav aria-label="main" className="scrollbar-none mx-auto mt-2 flex max-w-[1560px] gap-1 overflow-x-auto lg:hidden">
        {NAV.map((n) => {
          const on = path === n.href || path.startsWith(n.href + "/");
          return (
            <Link key={n.href} href={n.href} className={cn("flex h-9 flex-none items-center rounded-full border-1.5 border-line bg-cream-card px-3.5 text-[13px] font-bold", on && "border-frost-hot bg-frost text-frost-ink")}>{n.label}</Link>
          );
        })}
      </nav>
    </header>
  );
}
