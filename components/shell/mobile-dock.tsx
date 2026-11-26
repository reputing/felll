"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import * as Sheet from "@radix-ui/react-dialog";
import { BookOpen, CalendarDays, Clapperboard, Film, Home, LayoutGrid, MessageCircle, Sparkles, Trophy, Users, Bookmark, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

// The phone's navigation: a floating glass dock with the four places people go most, and a sheet for the rest. It replaces the
// row of pills that used to sit under the header (cut off at the edge, and hard to hit). Hidden from lg up, where the header has
// the full bar, and on the watch page, where the picture needs the whole screen.
const MAIN = [
  { href: "/home", label: "Explore", Icon: Home },
  { href: "/browse", label: "Anime", Icon: Clapperboard },
  { href: "/manga", label: "Manga", Icon: BookOpen },
  { href: "/movies", label: "Movies", Icon: Film },
];
const MORE = [
  { href: "/rankings", label: "Rankings", Icon: Trophy },
  { href: "/seasonal", label: "Seasonal", Icon: Sparkles },
  { href: "/schedule", label: "Schedule", Icon: CalendarDays },
  { href: "/rooms", label: "Watch rooms", Icon: Users },
  { href: "/community", label: "Community", Icon: MessageCircle },
  { href: "/box", label: "My box", Icon: Bookmark },
  { href: "/requests", label: "Requests", Icon: Inbox },
];

export function MobileDock() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (/^\/(watch|shh)(\/|$)/.test(path)) return null;
  const idx = MAIN.findIndex((n) => path === n.href || path.startsWith(n.href + "/"));
  const moreOn = idx < 0 && MORE.some((n) => path === n.href || path.startsWith(n.href + "/"));
  const slot = moreOn ? 4 : idx; // which of the five slots wears the highlight (-1: none)
  return (
    <>
      <nav aria-label="main" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(10px,env(safe-area-inset-bottom))] lg:hidden">
        <div className="glass-strong pointer-events-auto relative mx-auto grid h-[62px] max-w-[460px] grid-cols-5 rounded-[26px] p-1.5">
          {slot >= 0 && (
            <span aria-hidden className="absolute inset-y-1.5 left-1.5 w-[calc((100%-12px)/5)] rounded-[20px] bg-frost/90 shadow-[0_8px_20px_-8px_rgb(var(--glow)/.8)] transition-transform duration-300 ease-[cubic-bezier(.3,.9,.3,1)]" style={{ transform: `translateX(${slot * 100}%)` }} />
          )}
          {MAIN.map(({ href, label, Icon }, i) => (
            <Link key={href} href={href} aria-current={i === idx ? "page" : undefined} className={cn("relative z-10 flex flex-col items-center justify-center gap-0.5 rounded-[20px] text-[10.5px] font-extrabold transition-colors", i === idx ? "text-frost-ink" : "text-plum-body")}>
              <Icon className="size-[21px]" strokeWidth={i === idx ? 2.5 : 2} />{label}
            </Link>
          ))}
          <button type="button" onClick={() => setOpen(true)} aria-label="More" aria-expanded={open} className={cn("relative z-10 flex flex-col items-center justify-center gap-0.5 rounded-[20px] text-[10.5px] font-extrabold transition-colors", moreOn ? "text-frost-ink" : "text-plum-body")}>
            <LayoutGrid className="size-[21px]" strokeWidth={moreOn ? 2.5 : 2} />More
          </button>
        </div>
      </nav>
      <Sheet.Root open={open} onOpenChange={setOpen}>
        <Sheet.Portal>
          <Sheet.Overlay className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=open]:fade-in" />
          <Sheet.Content className="glass-strong fixed inset-x-0 bottom-0 z-[71] rounded-t-[30px] px-4 pb-[max(22px,env(safe-area-inset-bottom))] pt-3 outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom">
            <div aria-hidden className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-plum/20" />
            <Sheet.Title className="px-1 text-[18px] font-extrabold tracking-[-.5px] text-frost-deep">More places</Sheet.Title>
            <Sheet.Description className="sr-only">Other sections of cupcake</Sheet.Description>
            <div className="mt-3 grid grid-cols-3 gap-2.5">
              {MORE.map(({ href, label, Icon }) => {
                const on = path === href || path.startsWith(href + "/");
                return (
                  <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("glass flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-[20px] px-2 text-center text-[12px] font-extrabold", on && "border-frost-hot text-frost-text")}>
                    <Icon className="size-6 text-frost-text" strokeWidth={2} />{label}
                  </Link>
                );
              })}
            </div>
          </Sheet.Content>
        </Sheet.Portal>
      </Sheet.Root>
    </>
  );
}
