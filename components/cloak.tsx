"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { readLocal, syncCloak, type CloakPrefs } from "@/lib/cloak";
import { DISGUISES, SHH_PREFS_KEY, maskTo, setFavicon } from "@/lib/tab-mask";

// The cloak, on every page. What /shh sets up (and what follows the member between devices, see lib/cloak.ts) is used here:
//   - the tab disguise, held for the whole visit (Next rewrites the title on every navigation, so it is put back at once);
//   - anti-flip: the instant the tab loses focus the title and icon become the disguise picked for that, and come back after;
//   - the boss key: any chosen key covers the whole screen with the decoy (Word, Excel, ...), and Esc or its corner icon lifts it.
//     Anything playing is paused under the cover and picks up again when it is lifted.
// /shh runs its own copy of all of this, so this stands aside there. On the front door (the sign-in) the boss key stays off: its
// backtick is the key that opens the sign-in.
const Decoy = dynamic(() => import("@/components/shh/decoy").then((m) => m.Decoy), { ssr: false });

const titleOf = (target: string, custom: string): string | null => (target === "custom" ? custom.trim() || null : DISGUISES[target]?.title ?? null);

export function Cloak() {
  const pathname = usePathname();
  const shh = pathname.startsWith("/shh");
  const portal = pathname === "/";
  const [prefs, setPrefs] = useState<CloakPrefs | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const paused = useRef<HTMLMediaElement[]>([]);

  // this device's copy, then the account's (a newer one replaces it); re-read when /shh or another tab changes it
  useEffect(() => {
    setPrefs(readLocal());
    syncCloak().then((m) => { if (m) setPrefs(m); });
    const onStorage = (e: StorageEvent) => { if (e.key === SHH_PREFS_KEY) setPrefs(readLocal()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => { setPrefs(readLocal()); }, [pathname]);

  // the tab look
  useEffect(() => {
    if (shh || !prefs) return;
    const p = prefs;
    const fixed = p.disguise && p.disguise !== "off";
    let away = false;
    let real: string | null = null; // the page's own title, while a disguise is on it
    const look = () => (away && p.antiFlip ? { t: p.antiFlipTarget || "word", c: p.antiFlipCustom || "" } : fixed ? { t: p.disguise, c: p.customTitle || "" } : null);
    const put = () => {
      const l = look();
      if (!l) { if (real !== null) { document.title = real; real = null; } setFavicon(null); return; }
      if (real === null) real = document.title;
      maskTo(l.t, l.c);
    };
    // Next sets the real title on every navigation: remember it, and put the disguise straight back
    const mo = new MutationObserver(() => {
      const l = look();
      if (!l) return;
      const want = titleOf(l.t, l.c);
      if (want && document.title !== want) { real = document.title; document.title = want; }
      const fav = document.querySelector("link[data-shh-fav]");
      if (fav && fav !== document.head.lastElementChild) document.head.appendChild(fav);
    });
    const onVis = () => { away = document.visibilityState === "hidden"; put(); };
    // clicking into an embedded player (an iframe) blurs the window too, but the viewer has not gone anywhere
    const onBlur = () => { if (document.activeElement?.tagName === "IFRAME") return; away = true; put(); };
    const onFocus = () => { away = false; put(); };
    put();
    mo.observe(document.head, { childList: true, subtree: true, characterData: true });
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      if (real !== null) document.title = real;
      setFavicon(null);
    };
  }, [prefs, shh]);

  // the boss key
  useEffect(() => {
    if (shh || portal || !prefs?.bossKey || !prefs.bossKeys?.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !prefs.bossKeys.includes(e.key)) return;
      if ((e.target as HTMLElement | null)?.closest?.("input,textarea,select,[contenteditable='true']")) return;
      e.preventDefault();
      setCover((c) => (c ? null : prefs.decoy || "blank"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prefs, shh, portal]);
  useEffect(() => { if (shh || portal) setCover(null); }, [shh, portal]);

  // under the cover, nothing keeps playing (a sound would give it away)
  useEffect(() => {
    if (cover) {
      paused.current = Array.from(document.querySelectorAll<HTMLMediaElement>("video,audio")).filter((m) => !m.paused);
      paused.current.forEach((m) => m.pause());
    } else {
      paused.current.forEach((m) => { void m.play().catch(() => {}); });
      paused.current = [];
    }
  }, [cover]);

  return cover ? <Decoy skin={cover} config={prefs?.decoyConfig} onExit={() => setCover(null)} /> : null;
}
