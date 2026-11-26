"use client";
import { useEffect, useState } from "react";
import { Laptop, Loader2, LogOut, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { toast } from "@/lib/store";
import { cn } from "@/lib/utils";

// Every browser or phone currently signed in to your account, with a button to sign any of them out (a lost phone, a shared
// computer). "Sign out all other devices" keeps only the one you are holding. A device that is signed out lands on the sign-in
// the next time it loads a page.
interface Row { sid: string; created_at: number; expires_at: number; user_agent: string; current: boolean }

function describe(ua: string): { label: string; phone: boolean } {
  const phone = /iPhone|iPad|Android|Mobile/i.test(ua);
  const os = /Windows/i.test(ua) ? "Windows" : /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Linux|X11/i.test(ua) ? "Linux" : "";
  const br = /Edg\//i.test(ua) ? "Edge" : /OPR\/|Opera/i.test(ua) ? "Opera" : /Firefox|FxiOS/i.test(ua) ? "Firefox" : /Chrome|CriOS/i.test(ua) ? "Chrome" : /Safari/i.test(ua) ? "Safari" : "";
  const label = br && os ? `${br} on ${os}` : br || os || "Unknown device";
  return { label, phone };
}

const when = (t: number) => {
  const m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60));
  if (m < 2) return "just now";
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};

export function DevicesPanel() {
  const [rows, setRows] = useState<Row[] | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = () => fetch("/api/auth/sessions").then((r) => (r.ok ? r.json() : null)).then((d) => setRows(d?.sessions ?? null)).catch(() => setRows(null));
  useEffect(() => { load(); }, []);

  const call = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/auth/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast(d.error || "that didn’t work"); return null; }
    return d as { self?: boolean; count?: number };
  };
  const revoke = async (sid: string) => {
    setBusy(sid);
    const d = await call({ op: "revoke", sid });
    setBusy(null);
    if (!d) return;
    if (d.self) { location.href = "/?bye=1"; return; }
    toast("Signed that device out");
    load();
  };
  const others = async () => {
    setBusy("others");
    const d = await call({ op: "others" });
    setBusy(null);
    if (!d) return;
    toast(d.count ? `Signed out ${d.count} other device${d.count === 1 ? "" : "s"}` : "No other devices were signed in");
    load();
  };

  const many = (rows?.length ?? 0) > 1;
  return (
    <section aria-label="signed-in devices" className="flex flex-col gap-4 rounded-box border-1.5 border-line bg-cream-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Security</div>
          <h2 className="mt-1 text-lg font-extrabold tracking-[-.4px]">Signed-in devices</h2>
          <p className="mt-1 max-w-prose text-[13px] font-medium text-plum-muted">Everywhere your account is signed in right now. Sign out anything you don’t recognise, or anything you left logged in somewhere else.</p>
        </div>
        {many && (
          <Confirm title="Sign out all other devices?" body="Every other phone and browser is signed out. This one stays signed in." action="Sign them out" onConfirm={others}>
            <Button variant="outline" size="sm" disabled={busy === "others"} className="rounded-full px-4">
              {busy === "others" ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}Sign out all other devices
            </Button>
          </Confirm>
        )}
      </div>
      {rows === undefined ? (
        <div className="h-16 rounded-2xl skeleton" />
      ) : !rows ? (
        <p className="text-[13px] font-semibold text-plum-muted">Couldn’t load your devices right now.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(more ? rows : rows.slice(0, 6)).map((r) => {
            const d = describe(r.user_agent);
            const Icon = d.phone ? Smartphone : Laptop;
            return (
              <li key={r.sid} className={cn("flex items-center gap-3 rounded-2xl border-1.5 border-line bg-paper p-3", r.current && "border-frost-hot")}>
                <span className="grid size-10 flex-none place-items-center rounded-xl bg-cream-tint text-frost-text"><Icon className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-[14px] font-extrabold">{d.label}{r.current && <span className="rounded-full bg-frost px-2 py-0.5 text-[10.5px] font-extrabold text-frost-ink">This device</span>}</span>
                  <span className="text-[12px] font-semibold text-plum-muted">Signed in {when(r.created_at)}</span>
                </span>
                <Confirm title={r.current ? "Sign out of this device?" : "Sign this device out?"} body={r.current ? "You’ll be taken back to the sign-in." : `${d.label} will need to sign in again.`} action="Sign out" onConfirm={() => revoke(r.sid)}>
                  <Button variant="outline" size="sm" disabled={busy === r.sid} className="rounded-full px-3.5">{busy === r.sid ? <Loader2 className="size-3.5 animate-spin" /> : "Sign out"}</Button>
                </Confirm>
              </li>
            );
          })}
        </ul>
      )}
      {rows && rows.length > 6 && (
        <button type="button" onClick={() => setMore((m) => !m)} className="self-start rounded-full px-3 py-1.5 text-[12.5px] font-extrabold text-frost-text hover:bg-cream-tint">
          {more ? "Show fewer" : `Show ${rows.length - 6} more`}
        </button>
      )}
    </section>
  );
}
