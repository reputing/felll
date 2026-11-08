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
    <section className="rounded-box border-1.5 border-line bg-cream-card p-5">
      <div className="flex items-end justify-between">
        <div><div className="eyebrow">Lists</div><h2 className="mt-1 text-xl font-extrabold tracking-[-.6px]">Collections</h2></div>
        {self && <Link href="/collections" className="text-[12.5px] font-bold text-frost-text hover:text-frost-deep">Manage →</Link>}
      </div>
      {cols.length === 0 ? (
        <Link href="/collections" className="mt-4 block rounded-2xl border-1.5 border-dashed border-line p-6 text-center text-[13px] font-semibold text-plum-muted hover:border-frost-hot">Make your first list →</Link>
      ) : (
        // compact rows (cover beside the name) that share the width, so one list or eight both look settled
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {cols.slice(0, 9).map((c) => (
            <Link key={c.id} href={`/collections/${c.id}`} className="group flex items-center gap-3 rounded-2xl border-1.5 border-line-soft bg-paper p-2 pr-3 transition hover:border-frost-hot">
              <CollectionCover covers={c.covers} className="w-[84px] flex-none rounded-xl" />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-extrabold group-hover:text-frost-text">{c.name}</span>
                <span className="block text-[12px] font-semibold text-plum-muted">{c.count} {c.count === 1 ? "item" : "items"}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
