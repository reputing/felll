"use client";
import Link from "next/link";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Bell } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { POPUP, POPUP_LABEL } from "@/components/ui/popup";
import { ago } from "@/lib/utils";

interface Note { id: number; kind: string; text: string; read: number; created_at: number; href: string; handle: string | null; avatar_url: string | null }

export function NotificationsBell({ unread }: { unread: number }) {
  const [count, setCount] = useState(unread);
  const [notes, setNotes] = useState<Note[] | null>(null);

  const open = async (o: boolean) => {
    if (!o) return;
    const res = await fetch("/api/notifications", { method: "POST" }).catch(() => null);
    if (res?.ok) {
      setNotes((await res.json()).notes);
      setCount(0);
    }
  };

  return (
    <Menu.Root onOpenChange={open}>
      <Menu.Trigger aria-label={`Notifications${count ? `, ${count} new` : ""}`} className="relative grid size-11 place-items-center rounded-full hover:bg-cream-tint data-[state=open]:bg-cream-blush">
        <Bell className="size-[19px]" strokeWidth={2.2} />
        {count > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-[18px] place-items-center rounded-full bg-frost-hot px-1 text-[10px] font-extrabold text-white ring-2 ring-cream-card">{count > 9 ? "9+" : count}</span>}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={10} className={`${POPUP} w-[340px]`}>
          <div className={POPUP_LABEL}>Notifications</div>
          <div className="max-h-[420px] overflow-y-auto">
            {notes === null && <div className="m-2 h-16 rounded-2xl skeleton" />}
            {notes?.length === 0 && <p className="px-3 py-5 text-center text-[13px] text-plum-muted">All quiet. Go start a thread.</p>}
            {notes?.map((n) => (
              <Menu.Item key={n.id} asChild>
                <Link href={n.href} className="grid grid-cols-[34px_1fr] gap-2.5 rounded-2xl p-2 outline-none data-[highlighted]:bg-cream-tint">
                  <Avatar src={n.avatar_url} name={n.handle ?? "c"} size={34} />
                  <span className="min-w-0 text-[13px] leading-snug">
                    <span className="line-clamp-2"><b>{n.handle ? `@${n.handle}` : "cupcake"}</b> {n.text}</span>
                    <span className="text-[11.5px] font-semibold text-plum-muted">{ago(n.created_at)}{!n.read && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-frost-hot align-middle" />}</span>
                  </span>
                </Link>
              </Menu.Item>
            ))}
          </div>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
