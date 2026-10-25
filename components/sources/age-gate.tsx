"use client";
import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

// Wraps an adult source. Until the viewer confirms 18+, it shows a gate instead
// of the content and does NOT let any request through. On confirm it remembers
// the choice (localStorage) and sets the cookie the /api/manga-src proxy checks
// before it will talk to an adult source.
const KEY = "cupcake:adult";
const setCookie = () => { document.cookie = "cupcake_adult=1; path=/; max-age=31536000; samesite=lax"; };

export function AgeGate({ sourceName, children }: { sourceName: string; children: React.ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let v = false;
    try { v = localStorage.getItem(KEY) === "1"; } catch { /* storage off */ }
    if (v) setCookie();
    setOk(v);
  }, []);

  if (ok === null) return <div className="h-64 animate-pulse rounded-shell bg-cream-card" />;
  if (ok) return <>{children}</>;

  const confirm = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* storage off */ }
    setCookie();
    setOk(true);
  };

  return (
    <div className="mx-auto mt-8 flex max-w-[460px] flex-col items-center gap-4 rounded-shell border-1.5 border-line bg-cream-card p-8 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-cream-blush text-frost-text"><ShieldAlert className="size-7" /></div>
      <h2 className="text-xl font-extrabold tracking-[-.5px]">{sourceName} is 18+</h2>
      <p className="text-[14px] font-medium text-plum-muted">This source contains adult manhwa. You must be at least 18 years old to view it.</p>
      <div className="mt-1 flex w-full flex-col gap-2">
        <button type="button" onClick={confirm} className="h-11 rounded-full bg-frost font-extrabold text-frost-ink transition hover:brightness-105">I’m 18 or older — continue</button>
        <a href="/manga" className="h-11 grid place-items-center rounded-full border-1.5 border-line font-bold text-plum-body hover:border-frost-hot">Take me back</a>
      </div>
    </div>
  );
}
