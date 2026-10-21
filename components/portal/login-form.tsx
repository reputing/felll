"use client";
import { ArrowRight, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function LoginForm({ next }: { next: string }) {
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handle, password }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (res?.ok) {
      window.location.assign(next);
      return;
    }
    setBusy(false);
    setError(body?.error || "couldn’t sign you in, try again");
  }

  const field = "h-12 w-full rounded-2xl border-1.5 border-line bg-paper px-4 text-[14.5px] font-semibold text-plum outline-none transition focus:border-frost-hot focus:shadow-halo";
  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5">
      <label className="sr-only" htmlFor="handle">kuro handle</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[14px] font-medium text-plum-muted">@</span>
        <input id="handle" autoComplete="username" spellCheck={false} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="your kuro handle" className={cn(field, "pl-9")} />
      </div>
      <label className="sr-only" htmlFor="password">password</label>
      <div className="relative">
        <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-plum-muted" />
        <input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" className={cn(field, "pl-10 pr-12")} />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-xl text-plum-muted hover:bg-cream-tint hover:text-frost-text">
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error && <p role="alert" className="rounded-xl bg-cream-blush px-3.5 py-2.5 text-[13px] font-bold text-frost-deep animate-in fade-in">{error}</p>}
      <button disabled={busy || !handle || !password} className="group mt-1 flex h-12 items-center justify-center gap-2 rounded-2xl border-1.5 border-line bg-paper text-[14.5px] font-extrabold text-plum transition hover:border-frost-hot hover:text-frost-text disabled:opacity-50">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <>Sign in with password <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></>}
      </button>
    </form>
  );
}
