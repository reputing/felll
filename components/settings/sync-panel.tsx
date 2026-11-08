"use client";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

// Link AniList: pull your lists in (username is enough), and with a personal access token your
// progress, status and score are written back as you watch. Your list then drives "continue".
interface Link { username: string; hasToken: boolean; lastPull: number | null; lastPush: number | null; note: string | null }

const ago = (t: number | null) => (t ? new Date(t * 1000).toLocaleString() : "never");

export function SyncPanel() {
  const [link, setLink] = useState<Link | null | undefined>(undefined);
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => fetch("/api/sync").then((r) => r.json()).then((d) => setLink(d.link ?? null)).catch(() => setLink(null));
  useEffect(() => { load(); }, []);

  const call = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ ok: false, text: d.error || "that didn't work" });
      return r.ok ? d : null;
    } finally { setBusy(false); }
  };

  const save = async () => { if (await call({ op: "link", username, token })) { setToken(""); await load(); setMsg({ ok: true, text: "linked. pull your lists in below." }); } };
  const pull = async () => { const d = await call({ op: "pull" }); if (d) { setMsg({ ok: true, text: `pulled ${d.anime} anime and ${d.manga} manga from AniList. your box has ${d.total} shows now.` }); load(); } };
  const unlink = async () => { if (await call({ op: "unlink" })) { setLink(null); setMsg(null); } };

  const field = "h-10 w-full rounded-full border-1.5 border-line bg-cream-card px-4 text-[14px] font-semibold outline-none focus:border-frost-hot";
  return (
    <section className="rounded-box border-1.5 border-line bg-cream-card/80 p-5 backdrop-blur-xl sm:p-7">
      <div className="eyebrow">Sync</div>
      <h2 className="mb-1 mt-1 text-xl font-extrabold tracking-[-.6px]">AniList</h2>
      <p className="mb-4 text-[13.5px] font-semibold text-plum-muted">
        Bring your anime and manga lists in, and pick up where you stopped. Add an access token and what you watch here is written back to AniList too.
      </p>
      {link === undefined ? <Loader2 className="size-5 animate-spin text-frost-hot" /> : link ? (
        <div className="flex flex-col gap-3">
          <p className="text-[14px] font-semibold">Linked as <b>{link.username}</b> · {link.hasToken ? "updates are written back" : "read-only (no token)"}</p>
          <p className="text-[12.5px] text-plum-muted">last pulled {ago(link.lastPull)} · last pushed {ago(link.lastPush)}</p>
          {link.note && <p className="text-[12.5px] font-bold text-red-500">{link.note}</p>}
          {!link.hasToken && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="AniList access token (optional)" className={field} type="password" autoComplete="off" />
              <button type="button" disabled={busy || !token} onClick={() => call({ op: "link", username: link.username, token }).then((d) => { if (d) { setToken(""); load(); } })} className="h-10 flex-none rounded-full border-1.5 border-line px-4 text-[13px] font-bold hover:border-frost-hot disabled:opacity-50">Add token</button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={pull} className="flex h-10 items-center gap-2 rounded-full bg-frost px-5 text-[13.5px] font-extrabold text-frost-ink disabled:opacity-60">
              <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />Pull my lists
            </button>
            <button type="button" disabled={busy} onClick={unlink} className="h-10 rounded-full border-1.5 border-line px-5 text-[13.5px] font-bold text-plum-muted hover:border-frost-hot">Unlink</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="AniList username" className={field} autoComplete="off" />
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Access token (optional, lets cupcake update your AniList)" className={field} type="password" autoComplete="off" />
          <div className="rounded-2xl border-1.5 border-line-soft bg-paper p-3 text-[12px] leading-relaxed text-plum-muted">
            <p className="font-bold text-plum-body">Optional: let cupcake update your AniList too</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              <li>
                <a href="https://anilist.co/settings/developer" target="_blank" rel="noopener noreferrer" className="font-bold text-frost-text underline">Open AniList developer settings</a>, press <b>Create New Client</b>, name it anything, set the redirect URL to <code className="rounded bg-cream-tint px-1">https://anilist.co/api/v2/oauth/pin</code> and save. Copy the <b>ID</b> number it shows.
              </li>
              <li className="flex flex-wrap items-center gap-2">
                Paste the ID:
                <input value={clientId} onChange={(e) => setClientId(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 12345" className="h-8 w-[110px] rounded-full border-1.5 border-line bg-cream-card px-3 font-mono text-[12.5px] outline-none focus:border-frost-hot" />
                <a href={clientId ? `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&response_type=token` : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!clientId}
                  className={"inline-flex h-8 items-center rounded-full bg-frost px-3 text-[12px] font-extrabold text-frost-ink " + (clientId ? "" : "pointer-events-none opacity-50")}>Get my token</a>
              </li>
              <li>Press <b>Authorize</b> on AniList; it shows a long token. Copy it into the token box above. It is stored on cupcake&apos;s server and only used to update your list; unlink removes it.</li>
            </ol>
          </div>
          <button type="button" disabled={busy || (!username && !token)} onClick={save} className="h-10 w-fit rounded-full bg-frost px-5 text-[13.5px] font-extrabold text-frost-ink disabled:opacity-60">Link AniList</button>
        </div>
      )}
      {msg && <p className={msg.ok ? "mt-3 text-[13px] font-bold text-frost-text" : "mt-3 text-[13px] font-bold text-red-500"}>{msg.text}</p>}
    </section>
  );
}
