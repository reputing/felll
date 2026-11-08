"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Pause, Play, Users } from "lucide-react";
import { Poster } from "@/components/poster";

interface Room { code: string; malId: number; ep: number; title: string; image: string | null; host: string; paused: boolean }

// Public watch rooms, refreshed every few seconds. To open one, start a party from any episode
// (the "Watch together" button on the player) and switch on "List in public rooms".
export function RoomsLobby() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () => fetch("/api/party?list=1").then((r) => (r.ok ? r.json() : null)).then((d) => { if (!stop) setRooms(d?.rooms ?? []); }).catch(() => { if (!stop) setRooms((x) => x ?? []); });
    load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5000);
    return () => { stop = true; clearInterval(id); };
  }, []);
  if (rooms === null) return <div className="h-40 animate-pulse rounded-box bg-cream-card" />;
  if (!rooms.length) {
    return (
      <div className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center">
        <Users className="mx-auto size-8 text-frost-hot" />
        <p className="mt-2 text-lg font-extrabold">No public rooms right now.</p>
        <p className="mx-auto mt-1 max-w-[46ch] text-plum-muted">Start one from any episode with <b>Watch together</b> on the player, then switch on <b>List in public rooms</b>. It shows up here while you&apos;re playing.</p>
      </div>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {rooms.map((r) => (
        <li key={r.code}>
          <Link href={`/watch/${r.malId}/${r.ep}?party=${r.code}`} className="group flex items-center gap-3 rounded-3xl border-1.5 border-line bg-cream-card p-2.5 pr-4 transition hover:border-frost-hot">
            <Poster src={r.image} className="aspect-video w-[132px] flex-none rounded-2xl" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-extrabold">{r.title || `Anime ${r.malId}`}</span>
              <span className="block text-[12.5px] font-semibold text-plum-muted">Episode {r.ep} · hosted by {r.host}</span>
              <span className="mt-1 flex items-center gap-1 text-[11.5px] font-bold text-frost-text">{r.paused ? <><Pause className="size-3" />paused</> : <><Play className="size-3" fill="currentColor" />playing now</>}</span>
            </span>
            <span className="rounded-full bg-frost px-3.5 py-1.5 text-[12.5px] font-extrabold text-frost-ink">Join</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
