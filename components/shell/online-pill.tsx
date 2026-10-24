"use client";
import Link from "next/link";
import * as Popover from "@radix-ui/react-dropdown-menu";
import { Avatar } from "@/components/avatar";
import { POPUP, POPUP_LABEL } from "@/components/ui/popup";
import { usePresence } from "./presence";

export function OnlinePill() {
  const { count, people } = usePresence();
  return (
    <Popover.Root>
      <Popover.Trigger className="flex h-10 items-center gap-2 rounded-full border-1.5 border-line bg-cream-tint px-3.5 text-[12.5px] font-extrabold text-plum-body hover:border-frost-hot data-[state=open]:border-frost-hot">
        <span className="size-2 rounded-full bg-sprinkle-mint animate-pulse-dot" />
        <span className="tabular-nums">{count || 1}</span> <span className="hidden 2xl:inline">online</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className={`${POPUP} w-[300px]`}>
          <div className={POPUP_LABEL}>On cupcake right now</div>
          <div className="max-h-[360px] overflow-y-auto">
            {people.length === 0 && <p className="px-3 py-4 text-[13px] text-plum-muted">Just you. Cosy.</p>}
            {people.map((p) => (
              <Popover.Item key={p.handle} asChild>
                <Link href={p.manga_id ? `/manga/${p.manga_id}` : p.mal_id && p.episode ? `/watch/${p.mal_id}/${p.episode}` : `/u/${p.handle}`} className="grid grid-cols-[34px_1fr] items-center gap-2.5 rounded-2xl p-2 outline-none data-[highlighted]:bg-cream-tint">
                  <Avatar src={p.avatar_url} name={p.handle} size={34} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-extrabold">{p.display_name}</span>
                    <span className="block truncate text-[11.5px] font-semibold text-plum-muted">
                      {p.manga_id && p.title ? <>reading <span className="text-frost-text">{p.title}</span></>
                        : p.title ? <>watching <span className="text-frost-text">{p.title}</span>{p.episode ? ` · ep ${p.episode}` : ""}</>
                        : `@${p.handle} · browsing`}
                    </span>
                  </span>
                </Link>
              </Popover.Item>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
