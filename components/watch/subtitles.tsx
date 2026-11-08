"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { activeAt, type Cue } from "@/lib/subs";
import { cn } from "@/lib/utils";

// Our own subtitle drawing, so size, position, colours and timing are the viewer's to set
// (some like the screen full of text, some don't want it covering the action). The video's
// own <track> elements stay in the page only as a fallback for streams we can't fetch the text of.

export interface SubStyle {
  size: number;        // 60-200 (% of the default size)
  bottom: number;      // 2-40 (% of the picture height, measured from the bottom)
  bg: number;          // 0-90 (% opacity of the dark box behind the text)
  color: string;       // text colour
  edge: "none" | "outline" | "shadow";
  bold: boolean;
  font: "sans" | "serif" | "mono";
}
export const DEFAULT_STYLE: SubStyle = { size: 100, bottom: 8, bg: 0, color: "#ffffff", edge: "outline", bold: true, font: "sans" };
const KEY = "subStyle";

export function useSubStyle(): [SubStyle, (p: Partial<SubStyle>) => void, () => void] {
  const [style, setStyle] = useState<SubStyle>(DEFAULT_STYLE);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v) setStyle({ ...DEFAULT_STYLE, ...v }); } catch { /* storage off */ } }, []);
  const patch = useCallback((p: Partial<SubStyle>) => setStyle((s) => { const n = { ...s, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* */ } return n; }), []);
  const reset = useCallback(() => { setStyle(DEFAULT_STYLE); try { localStorage.removeItem(KEY); } catch { /* */ } }, []);
  return [style, patch, reset];
}

const FONT = { sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", serif: "Georgia, 'Times New Roman', serif", mono: "ui-monospace, 'SF Mono', Menlo, monospace" };

const EDGE = {
  none: "none",
  outline: "-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 2px 4px rgba(0,0,0,.6)",
  shadow: "0 2px 6px rgba(0,0,0,.95), 0 0 2px rgba(0,0,0,.9)",
};

/** Draws the cue(s) showing now, `offset` seconds later than the file says. Sits over the picture
 *  and never takes a click. `preview` shows a sample line while the style panel is open. */
export function SubtitleLayer({ video, cues, offset, style, preview }: { video: RefObject<HTMLVideoElement | null>; cues: Cue[]; offset: number; style: SubStyle; preview: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [h, setH] = useState(480);

  // follow the video clock (a frame loop: timeupdate only fires ~4 times a second, which makes lines late)
  useEffect(() => {
    let raf = 0, last: string | null = null; // null: the first frame always syncs, so a stale line is cleared when the timing or track changes
    const tick = () => {
      const v = video.current;
      const text = v && cues.length ? activeAt(cues, v.currentTime - offset).map((c) => c.text).join("\n") : "";
      if (text !== last) { last = text; setLines(text ? text.split("\n") : []); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [video, cues, offset]);

  // size the text from the picture's height so it scales with the player (and fullscreen)
  useEffect(() => {
    const el = host.current?.parentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setH(el.clientHeight || 480));
    ro.observe(el); setH(el.clientHeight || 480);
    return () => ro.disconnect();
  }, []);

  const shown = lines.length ? lines : preview ? ["Subtitles look like this"] : [];
  if (!shown.length) return <div ref={host} aria-hidden className="hidden" />;
  const px = Math.max(11, h * 0.046 * (style.size / 100));
  return (
    <div ref={host} aria-live="off" className="pointer-events-none absolute inset-x-0 z-[6] flex flex-col items-center px-[6%]" style={{ bottom: `${style.bottom}%` }}>
      {shown.map((l, i) => (
        <span key={i} className={cn("max-w-full whitespace-pre-wrap text-center leading-[1.25]", !lines.length && "opacity-80")}
          style={{
            fontSize: px, fontFamily: FONT[style.font], fontWeight: style.bold ? 700 : 500, color: style.color, textShadow: EDGE[style.edge],
            background: style.bg ? `rgba(0,0,0,${style.bg / 100})` : undefined, padding: style.bg ? "0.05em 0.4em" : undefined, borderRadius: "0.25em", marginTop: i ? "0.12em" : 0,
          }}
          dangerouslySetInnerHTML={{ __html: l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/&lt;(\/?)(i|b|u)>/gi, "<$1$2>") }} />
      ))}
    </div>
  );
}
