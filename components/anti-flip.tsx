"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { maskTo, readAntiFlip, setFavicon } from "@/lib/tab-mask";

// Anti-flip for the whole site. The moment the tab loses focus the title and icon become the disguise picked in /shh, and
// they come back when the viewer returns, so the tab never shows what it really is to anyone glancing over. It has no
// settings of its own: /shh is the only place it is switched on or configured, and this just reads that choice.
// /shh itself runs its own copy of this (together with its static disguise), so it stands aside there.
export function AntiFlip() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname.startsWith("/shh")) return;
    let saved: string | null = null;
    const away = () => {
      const p = readAntiFlip();
      if (!p.on || saved !== null) return;
      saved = document.title;
      maskTo(p.target, p.custom);
    };
    const back = () => {
      if (saved === null) return;
      document.title = saved;
      saved = null;
      setFavicon(null);
    };
    const onVis = () => (document.visibilityState === "hidden" ? away() : back());
    // clicking into an embedded player (an iframe) blurs the window too, but the viewer has not gone anywhere
    const onBlur = () => { if (document.activeElement?.tagName === "IFRAME") return; away(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", back);
      back();
    };
  }, [pathname]);
  return null;
}
