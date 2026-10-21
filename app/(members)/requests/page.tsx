import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { all } from "@/lib/db";
import { ago, cn } from "@/lib/utils";
import { PageHead } from "@/components/page-head";
import { Poster } from "@/components/poster";
import { RequestButton } from "@/components/watch/bits";
import { RequestAdmin } from "@/components/request-admin";

export const metadata = { title: "Requests" };

export default async function Requests() {
  const me = await requireMember("/requests");
  const rows = await all<{ mal_id: number; title: string; image: string | null; votes: number; status: string; created_at: number; handle: string; voted: number }>(
    `select r.mal_id, r.title, r.image, r.votes, r.status, r.created_at, u.handle,
            exists(select 1 from request_votes v where v.mal_id = r.mal_id and v.user_id = ?) as voted
     from requests r join users u on u.id = r.requested_by
     order by r.status = 'open' desc, r.votes desc, r.created_at desc limit 200`,
    me.id,
  );
  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="What should land in the vault next" title="Requests" sub="Vote for shows you want uploaded. Request anything from its watch page." />
      {rows.length === 0 && <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">No requests yet. Open any episode that isn’t uploaded and hit “Request”.</p>}
      <ol className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={r.mal_id} className={cn("grid grid-cols-[40px_52px_1fr_auto] items-center gap-3 rounded-3xl border-1.5 border-line bg-cream-card p-2.5 pr-3", r.status !== "open" && "opacity-70")}>
            <span className="text-center font-mono text-[20px] text-plum-faint">{i + 1}</span>
            <Link href={`/anime/${r.mal_id}`}><Poster src={r.image} className="h-[70px] w-[52px] rounded-xl" /></Link>
            <div className="min-w-0">
              <Link href={`/anime/${r.mal_id}`} className="line-clamp-1 text-[15px] font-extrabold hover:text-frost-text">{r.title}</Link>
              <div className="text-[12px] font-semibold text-plum-muted">asked by @{r.handle} · {ago(r.created_at)}{r.status !== "open" ? ` · ${r.status}` : ""}</div>
            </div>
            <div className="flex items-center gap-2">
              {me.is_admin ? <RequestAdmin malId={r.mal_id} status={r.status} /> : null}
              {r.status === "open" && <RequestButton malId={r.mal_id} title={r.title} image={r.image} votes={r.votes} voted={!!r.voted} />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
