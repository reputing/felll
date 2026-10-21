"use client";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

/** Trailer in a themed modal; the YouTube player only loads once it's opened. */
export function TrailerButton({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={`${title} · trailer`} className="w-[min(94vw,960px)]">
        <div className="mt-4 aspect-video overflow-hidden rounded-2xl bg-night">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
            title={`${title} trailer`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="size-full"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
