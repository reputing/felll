import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { all } from "@/lib/db";
import { ago } from "@/lib/utils";

/** What the people you follow did lately. */
export async function FriendsNow({ userId }: { userId: string }) {
  const rows = await all<{ handle: string; avatar_url: string | null; kind: string; mal_id: number | null; episode: number | null; title: string | null; detail: string | null; created_at: number }>(
    `select u.handle, u.avatar_url, a.kind, a.mal_id, a.episode, a.title, a.detail, a.created_at
     from activity a join follows f on f.followee_id = a.user_id join users u on u.id = a.user_id
     where f.follower_id = ? order by a.created_at desc limit 6`,
    userId,
  );
  return (
    <section className="rounded-box border-1.5 border-line bg-cream-card px-3 pb-3 pt-[18px]">
      <div className="mb-2 flex items-baseline justify-between px-1.5">
        <h2 className="text-[17px] font-extrabold tracking-[-.4px]">Your people</h2>
        <Link href="/community" className="text-[12px] font-bold text-frost-text hover:text-frost-deep">Feed</Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-1.5 pb-2 text-[13px] text-plum-muted">Follow members from their page and their watching shows up here. <Link href="/community" className="font-bold text-frost-text">Find people →</Link></p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {rows.map((r, i) => (
            <li key={i}>
              <Link href={r.mal_id ? `/anime/${r.mal_id}` : `/u/${r.handle}`} className="grid grid-cols-[32px_1fr] items-center gap-2.5 rounded-[14px] p-1.5 hover:bg-cream-tint">
                <Avatar src={r.avatar_url} name={r.handle} size={32} />
                <span className="min-w-0 text-[12.5px] leading-snug">
                  <span className="line-clamp-2"><b>@{r.handle}</b> {describe(r)}</span>
                  <span className="text-[11px] font-semibold text-plum-muted">{ago(r.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function describe(r: { kind: string; title: string | null; detail: string | null; episode: number | null }) {
  const t = <b className="text-frost-text">{r.title}</b>;
  switch (r.kind) {
    case "status": return <>marked {t} as {r.detail?.toLowerCase()}</>;
    case "rated": return <>rated {t} {r.detail}/10</>;
    case "favorite": return <>loved {t}</>;
    case "comment": return <>commented on {t}{r.episode ? ` ep ${r.episode}` : ""}</>;
    case "finished_episode": return <>watched {t} ep {r.episode}</>;
    case "follow": return <>followed @{r.detail}</>;
    default: return <>did something with {t}</>;
  }
}
