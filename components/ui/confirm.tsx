"use client";
import { useState } from "react";
import { Button } from "./button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "./dialog";

/** A themed "are you sure?" in place of the browser's grey confirm(). */
export function Confirm({ title, body, action = "Yes, do it", onConfirm, children }: { title: string; body?: string; action?: string; onConfirm: () => void | Promise<void>; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={title} description={body} className="w-[min(92vw,400px)]">
        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild><Button variant="outline" size="sm" className="rounded-full px-4">Never mind</Button></DialogClose>
          <Button size="sm" className="rounded-full px-4" onClick={async () => { await onConfirm(); setOpen(false); }}>{action}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
