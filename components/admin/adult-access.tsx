"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Avatar } from "@/components/avatar";

interface Row { id: string; handle: string; display_name: string; avatar_url: string | null; adult_ok: number }

export function AdultAccessAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/adult").then((r) => (r.ok ? r.json() : null)).then((d) => setRows(d?.users ?? [])).catch(() => setRows([]));
  }, []);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = rows ?? [];
    if (!n) return list;
    return list.filter((u) => u.handle.toLowerCase().includes(n) || u.display_name.toLowerCase().includes(n));
  }, [rows, q]);

  const toggle = async (u: Row) => {
    setBusy(u.id);
    const approve = u.adult_ok !== 1;
    try {
      const r = await fetch("/api/admin/adult", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: u.handle, approve }) });
      if (r.ok) setRows((prev) => (prev ?? []).map((x) => (x.id === u.id ? { ...x, adult_ok: approve ? 1 : 0 } : x)));
    } finally {
      setBusy(null);
    }
  };

  const approvedCount = (rows ?? []).filter((u) => u.adult_ok === 1).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-plum-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members…" aria-label="Search members"
          className="h-12 w-full rounded-full border-1.5 border-line bg-cream-card pl-11 pr-4 text-[15px] font-semibold outline-none focus:border-frost-hot" />
      </div>
      {rows === null ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-cream-card" />)}</div>
      ) : (
        <>
          <div className="px-1 text-[12.5px] font-semibold text-plum-muted">{approvedCount} approved · {rows.length} members</div>
          <ul className="flex flex-col gap-1.5">
            {filtered.map((u) => (
              <li key={u.id} className="flex items-center gap-3 rounded-2xl border-1.5 border-line bg-cream-card p-2 pr-3">
                <Avatar src={u.avatar_url} name={u.handle} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-extrabold">{u.display_name}</div>
                  <div className="truncate text-[12px] font-semibold text-plum-muted">@{u.handle}</div>
                </div>
                <button type="button" onClick={() => toggle(u)} disabled={busy === u.id}
                  className={`flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-extrabold transition disabled:opacity-60 ${u.adult_ok === 1 ? "bg-frost text-frost-ink" : "border-1.5 border-line text-plum-body hover:border-frost-hot"}`}>
                  {u.adult_ok === 1 ? <><Check className="size-4" strokeWidth={3} />Approved</> : "Approve 18+"}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="rounded-2xl border-1.5 border-dashed border-line bg-cream-card p-8 text-center font-semibold text-plum-muted">No members match that.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
