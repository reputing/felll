"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { RETRY_DELAYS, pageChain } from "@/lib/page-chain";

// One manga page image. It walks a chain of URLs (see lib/page-chain.ts); when
// the whole chain fails it waits and goes round again on a backoff, because the
// CDN's 404 episodes are transient. While it isn't loaded the reader sees a real
// placeholder ("loading page 2…", then a tap-to-retry) instead of a blank box
// with a broken-image icon. A page that loads fine is never disturbed.
export function PageImg({ n, dataN, src, altSrc, mdCh, mdFirst, proxy, eager, onReqAlt, className, wrapClassName }: {
  n: number; dataN?: number; src: string; altSrc?: string; mdCh?: string; mdFirst?: boolean; proxy?: boolean;
  eager?: boolean; onReqAlt?: () => void; className?: string; wrapClassName?: string;
}) {
  const chain = useMemo(() => pageChain({ n, src, altSrc, mdCh, mdFirst, proxy }), [n, src, altSrc, mdCh, mdFirst, proxy]);
  const [i, setI] = useState(0);
  const [round, setRound] = useState(0);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // a different page (new chapter / new source) starts over
  const ident = `${mdCh ?? ""}|${n}|${src}`;
  useEffect(() => {
    clearTimeout(timer.current);
    setI(0); setRound(0); setState("loading");
    return () => clearTimeout(timer.current);
  }, [ident]);

  const onError = () => {
    if (i === 0) onReqAlt?.();
    if (i + 1 < chain.length) { setI(i + 1); return; }
    // every url failed: go round again after a delay, then give up
    if (round < RETRY_DELAYS.length) {
      const wait = RETRY_DELAYS[round];
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { setRound((r) => r + 1); setI(0); }, wait);
    } else {
      setState("failed");
    }
  };
  const retryNow = () => { clearTimeout(timer.current); setRound(0); setI(0); setState("loading"); };

  const ok = state === "ok";
  const retrying = !ok && state !== "failed" && (round > 0 || i > 0);
  return (
    <div data-n={dataN} className={["relative", wrapClassName].filter(Boolean).join(" ")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={round}
        src={chain[Math.min(i, chain.length - 1)]}
        alt={`Page ${n + 1}`}
        loading={eager ? "eager" : "lazy"}
        referrerPolicy="no-referrer"
        onLoad={() => setState("ok")}
        onError={onError}
        className={className}
        // Until it has loaded, keep it in the DOM (so it keeps loading) but out of
        // sight; the placeholder below holds the layout instead.
        style={ok ? undefined : { position: "absolute", left: 0, top: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
      {!ok && (
        <div className="grid w-full place-items-center bg-white/[0.03] px-4 text-center" style={{ minHeight: "min(72svh, 620px)" }}>
          {state === "failed" ? (
            <button type="button" onClick={retryNow} className="flex flex-col items-center gap-2 text-white/70 hover:text-white">
              <RotateCw className="size-6" />
              <span className="text-[13px] font-bold">page {n + 1} didn’t load</span>
              <span className="text-[12px] font-semibold text-white/45">tap to try again</span>
            </button>
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/55">
              <Loader2 className="size-6 animate-spin" />
              <span className="text-[12.5px] font-semibold">{retrying ? `page ${n + 1} is slow, retrying…` : `loading page ${n + 1}…`}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
