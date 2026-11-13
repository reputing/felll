"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// The signed-out front door looks like a server that is down. The real portal (the sign-in) is what `children` holds, and it
// appears when the backtick key is pressed (on a phone, which has none: tap the "503" five times). Escape puts the disguise
// back. It is kept for the rest of the tab's life (sessionStorage), and a failed sign-in lands back here with ?error or ?sso,
// which opens it straight away so nobody is left staring at an outage page after typing a wrong password.
//
// This is a curtain, not a lock: the sign-in endpoints are still there and still do their own checks.
const KEY = "cupcake:portal-open";

export function SecretGate({ children, open: forced, locked }: { children: React.ReactNode; open?: boolean; locked?: boolean }) {
  const [open, setOpen] = useState(!!forced);
  const taps = useRef({ n: 0, at: 0 });

  const reveal = useCallback(() => { setOpen(true); try { sessionStorage.setItem(KEY, "1"); } catch { /* private mode */ } }, []);
  const hide = useCallback(() => { setOpen(false); try { sessionStorage.removeItem(KEY); } catch { /* */ } }, []);

  // locked: this browser was just signed out from another device, so a sign-in opened earlier in this tab is closed again
  useEffect(() => { try { if (locked) sessionStorage.removeItem(KEY); else if (sessionStorage.getItem(KEY) === "1") setOpen(true); } catch { /* */ } }, [locked]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Backquote" || e.key === "`") { if (!open) { e.preventDefault(); reveal(); } }
      else if (e.key === "Escape" && open) hide();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, reveal, hide]);

  if (open) return <>{children}</>;

  const tap = () => {
    const now = Date.now(), t = taps.current;
    t.n = now - t.at > 2500 ? 1 : t.n + 1;
    t.at = now;
    if (t.n >= 5) { t.n = 0; reveal(); }
  };

  return (
    <main className="grid min-h-svh place-items-center bg-[#0c0c0e] px-6 text-[#b9b9c0]">
      <div className="w-full max-w-[560px]">
        <h1 onClick={tap} className="select-none text-[88px] font-semibold leading-none tracking-[-4px] text-[#e6e6ea] sm:text-[112px]">503</h1>
        <h2 className="mt-3 text-[22px] font-semibold tracking-[-.3px] text-[#e6e6ea]">Service Unavailable</h2>
        <p className="mt-3 text-[15px] leading-relaxed">
          The server is temporarily unable to service your request due to maintenance downtime or capacity problems. Please try again later.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <button type="button" onClick={() => location.reload()} className="rounded-md border border-white/15 px-4 py-2 font-medium text-[#e6e6ea] transition hover:bg-white/5">Try again</button>
          <span className="font-mono text-[12px] text-[#6d6d76]">HTTP 503 · retry-after 3600</span>
        </div>
      </div>
    </main>
  );
}
