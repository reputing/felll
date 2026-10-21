"use client";
import { UserCheck, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "@/lib/store";
import { cn } from "@/lib/utils";

export function FollowButton({ handle, following, followers }: { handle: string; following: boolean; followers: number }) {
  const [s, setS] = useState({ following, followers });
  const go = async () => {
    setS((x) => ({ following: !x.following, followers: x.followers + (x.following ? -1 : 1) }));
    const res = await fetch("/api/follow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle }) }).catch(() => null);
    if (res?.ok) { const j = await res.json(); setS(j); if (j.following) toast(`Following @${handle}`); }
    else setS({ following, followers });
  };
  return (
    <button type="button" onClick={go} aria-pressed={s.following}
      className={cn("flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-extrabold transition", s.following ? "border-1.5 border-night-edge bg-night/60 text-night-text hover:border-frost" : "bg-frost text-frost-ink shadow-press hover:brightness-105")}>
      {s.following ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}{s.following ? "Following" : "Follow"}
    </button>
  );
}
