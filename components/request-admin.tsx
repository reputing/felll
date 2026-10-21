"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { POPUP, POPUP_ITEM } from "@/components/ui/popup";
import { toast } from "@/lib/store";
import { cn } from "@/lib/utils";

export function RequestAdmin({ malId, status }: { malId: number; status: string }) {
  const router = useRouter();
  const set = async (s: string) => {
    const res = await fetch("/api/requests", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ malId, status: s }) });
    toast(res.ok ? `Marked ${s}` : "Couldn’t update");
    router.refresh();
  };
  return (
    <Menu.Root>
      <Menu.Trigger aria-label="Admin" className="grid size-10 place-items-center rounded-full border-1.5 border-line hover:border-frost-hot"><MoreHorizontal className="size-4" /></Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className={cn(POPUP, "w-[200px]")}>
          {["filled", "declined", "open"].filter((s) => s !== status).map((s) => (
            <Menu.Item key={s} className={POPUP_ITEM} onSelect={() => set(s)}>Mark {s}</Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
