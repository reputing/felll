"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { userCollections, type CollectionCard } from "@/lib/collections";
import { CollectionCover } from "@/components/collections/manager";

// A member's collections on their profile. The API returns only public ones to
// other viewers; the owner sees all of theirs (including private).
export function ProfileCollections({ handle, self }: { handle: string; self: boolean }) {
  const [cols, setCols] = useState<CollectionCard[] | null>(null);
  useEffect(() => { userCollections(handle).then(setCols).catch(() => setCols([])); }, [handle]);

  if (cols === null) return null;
  if (cols.length === 0 && !self) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[17px] font-extrabold">Collections</h2>
        {self && <Link href="/collections" className="text-[12.5px] font-bold text-frost-text hover:text-frost-deep">Manage →</Link>}
      </div>
      {cols.length === 0 ? (
        <Link href="/collections" className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-6 text-center text-[13px] font-semibold text-plum-muted hover:border-frost-hot">Make your first list →</Link>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {cols.slice(0, 8).map((c) => (
            <Link key={c.id} href={`/collections/${c.id}`} className="group flex flex-col gap-2">
              <CollectionCover covers={c.covers} />
              <span className="truncate px-0.5 text-[13.5px] font-extrabold group-hover:text-frost-text">{c.name}</span>
              <span className="-mt-1.5 px-0.5 text-[12px] font-semibold text-plum-muted">{c.count} {c.count === 1 ? "item" : "items"}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
