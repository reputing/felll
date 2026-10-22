"use client";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-5 text-center">
      <div className="flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={72} height={72} className="animate-float rounded-2xl bg-paper p-1" />
        <p className="text-2xl font-extrabold tracking-tight text-frost-deep">Oh crumbs.</p>
        <p className="max-w-[44ch] text-plum-muted">Something went wrong fetching this page. The catalog might be having a moment.</p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
