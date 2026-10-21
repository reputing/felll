"use client";
import Link from "next/link";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, Clock3, Crown, LibraryBig, LogOut, Palette, Settings, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { POPUP, POPUP_ITEM, POPUP_SEPARATOR } from "@/components/ui/popup";
import { SKINS } from "@/lib/skins";

export interface MenuUser { handle: string; display_name: string; avatar_url: string | null; is_plus: number; accent: string }

const item = POPUP_ITEM;

export function UserMenu({ user }: { user: MenuUser }) {
  const [skin, setSkin] = useState<string | null>(null);
  const pick = (id: string) => {
    document.documentElement.dataset.skin = id;
    document.cookie = `skin=${id}; path=/; max-age=31536000; samesite=lax`;
    setSkin(id);
    fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme: id }) }).catch(() => {});
  };
  const current = skin ?? (typeof document !== "undefined" ? document.documentElement.dataset.skin : "midnight");

  return (
    <Menu.Root>
      <Menu.Trigger aria-label="Your account" className="rounded-full outline-none ring-frost-hot transition hover:ring-2 focus-visible:ring-2">
        <Avatar src={user.avatar_url} name={user.handle} size={44} ring={user.accent} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={10} className={`${POPUP} w-[250px]`}>
          <div className="flex items-center gap-2.5 px-2.5 pb-3 pt-2">
            <Avatar src={user.avatar_url} name={user.handle} size={38} />
            <div className="min-w-0">
              <div className="flex items-center gap-1 truncate font-extrabold">{user.display_name}{user.is_plus ? <Crown className="size-3.5 text-sprinkle-star" /> : null}</div>
              <div className="truncate text-[12px] font-semibold text-plum-muted">@{user.handle}</div>
            </div>
          </div>
          <Menu.Separator className="mx-2 mb-1.5 h-[1.5px] bg-line-soft" />
          <Menu.Item asChild><Link href={`/u/${user.handle}`} className={item}><UserRound className="size-4" />Your page</Link></Menu.Item>
          <Menu.Item asChild><Link href="/box" className={item}><LibraryBig className="size-4" />My box</Link></Menu.Item>
          <Menu.Item asChild><Link href="/box/history" className={item}><Clock3 className="size-4" />History</Link></Menu.Item>
          <Menu.Item asChild><Link href="/community" className={item}><Users className="size-4" />Friends &amp; feed</Link></Menu.Item>
          <Menu.Item asChild><Link href="/settings" className={item}><Settings className="size-4" />Customize</Link></Menu.Item>
          <Menu.Separator className={POPUP_SEPARATOR} />
          <div className="eyebrow flex items-center gap-1.5 px-3 pb-1.5 pt-1"><Palette className="size-3" />Skin</div>
          <div className="grid grid-cols-4 gap-1.5 px-2 pb-2">
            {SKINS.map((s) => (
              <button key={s.id} type="button" onClick={() => pick(s.id)} title={s.label} aria-pressed={current === s.id}
                className="relative grid h-10 place-items-center rounded-xl border-1.5 border-line" style={{ background: `linear-gradient(135deg, ${s.swatch[0]} 50%, ${s.swatch[1]} 50%)` }}>
                {current === s.id && <Check className="size-4 rounded-full bg-paper p-0.5 text-frost-text" strokeWidth={3} />}
              </button>
            ))}
          </div>
          <Menu.Separator className={POPUP_SEPARATOR} />
          <form action="/api/auth/logout" method="post">
            <Menu.Item asChild><button className={`${item} w-full`}><LogOut className="size-4" />Sign out</button></Menu.Item>
          </form>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
