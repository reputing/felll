"use client";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-5 text-center">
      <div className="flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cupcake.png" alt="" width={76} height={76} className="size-[76px] animate-float drop-shadow-[0_6px_14px_rgb(var(--glow)/.4)]" />
        <p className="text-2xl font-extrabold tracking-tight text-frost-deep">Oh crumbs.</p>
        <p className="max-w-[44ch] text-plum-muted">Something went wrong fetching this page. The catalog might be having a moment.</p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
