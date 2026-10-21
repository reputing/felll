"use client";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/store";

/** Copies a link (with the current time on the watch page, when given). */
export function ShareButton({ path, title, getTime, variant = "night" }: { path: string; title: string; getTime?: () => number; variant?: "night" | "outline" }) {
  const share = async () => {
    const t = getTime?.();
    const url = `${location.origin}${path}${t ? `?t=${Math.floor(t)}` : ""}`;
    try {
      if (navigator.share && /Mobi/.test(navigator.userAgent)) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); toast(t ? "Link copied, starts at this moment" : "Link copied"); }
    } catch { /* dismissed */ }
  };
  return <Button size="lg" variant={variant} onClick={share} aria-label="Copy link"><Link2 className="size-4" /></Button>;
}
