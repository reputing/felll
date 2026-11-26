"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Content eases in, un-blurring, the first time it scrolls into view (the "BlurFade" pattern from the 21st.dev / Magic UI set).
 *  The motion itself is CSS (.bf in globals.css), so it is switched off by prefers-reduced-motion. `delay` staggers siblings. */
export function BlurFade({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { rootMargin: "0px 0px -6% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={cn("bf", on && "in", className)} style={{ "--bf-d": `${delay}ms` } as CSSProperties}>{children}</div>;
}
