"use client";
import { useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";

// Follow an airing show → a notification when its next episode drops.
export function FollowShow({ malId, initial }: { malId: number; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const prev = on;
    setOn(!on);
    try {
      const r = await fetch("/api/follow-show", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ malId }) });
      if (!r.ok) throw new Error();
      setOn(!!(await r.json()).following);
    } catch {
      setOn(prev);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="lg" variant={on ? "soft" : "night"} onClick={toggle} disabled={busy} aria-pressed={on}>
      {on ? <BellRing className="size-4" /> : <Bell className="size-4" />}
      {on ? "Following" : "Follow"}
    </Button>
  );
}
