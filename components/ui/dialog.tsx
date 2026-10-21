"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { OVERLAY, POPUP } from "./popup";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title, description, children, className, hideTitle,
}: { title: string; description?: string; children: React.ReactNode; className?: string; hideTitle?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className={OVERLAY} />
      <D.Content
        className={cn(POPUP, "fixed left-1/2 top-1/2 w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-shell p-5", className)}
      >
        <D.Title className={cn("pr-10 text-[19px] font-extrabold tracking-[-.5px] text-frost-deep", hideTitle && "sr-only")}>{title}</D.Title>
        {description ? <D.Description className="mt-1 text-[13.5px] text-plum-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        {children}
        <D.Close aria-label="Close" className="absolute right-3.5 top-3.5 grid size-9 place-items-center rounded-full text-plum-muted hover:bg-cream-blush hover:text-frost-deep">
          <X className="size-4" strokeWidth={2.6} />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
