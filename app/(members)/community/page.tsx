import Link from "next/link";
import { Clock, Crown, Medal, MessageSquare, Star, Tv } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { all } from "@/lib/db";
import { ago, cn } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { PageHead } from "@/components/page-head";
import { Poster } from "@/components/poster";
import { describe } from "@/components/home/friends-now";

export const metadata = { title: "Community" };

type SP = { tab?: string; q?: string; scope?: string };
const TABS = { feed: "Feed", members: "Members", board: "Leaderboard" } as const;

export default async function Community({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const me = await requireMember("/community");
  const tab = (sp.tab && sp.tab in TABS ? sp.tab : "feed") as keyof typeof TABS;
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="kuro members on cupcake" title="Community" sub="See what everyone’s watching, find your people, climb the board." />
      <nav className="flex gap-1.5">
        {Object.entries(TABS).map(([k, l]) => (
          <Link key={k} href={`/community?tab=${k}`} className={cn("flex h-10 items-center rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold hover:border-frost-hot", tab === k && "border-frost-hot bg-frost text-frost-ink")}>{l}</Link>
        ))}
      </nav>
      {tab === "feed" && <Feed meId={me.id} everyone={sp.scope === "all"} />}
      {tab === "members" && <Members q={sp.q} />}
      {tab === "board" && <Board />}
    </div>
  );
}

async function Feed({ meId, everyone }: { meId: string; everyone: boolean }) {
  const rows = await all<{ handle: string; display_name: string; avatar_url: string | null; accent: string; kind: string; mal_id: number | null; episode: number | null; title: string | null; image: string | null; detail: string | null; created_at: number }>(
    `select u.handle, u.display_name, u.avatar_url, u.accent, a.kind, a.mal_id, a.episode, a.title, a.image, a.detail, a.created_at
     from activity a join users u on u.id = a.user_id
     ${everyone ? "" : "where a.user_id in (select followee_id from follows where follower_id = ?1) or a.user_id = ?1"}
     order by a.created_at desc limit 60`,
    ...(everyone ? [] : [meId]),
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {[["following", "People you follow"], ["all", "Everyone"]].map(([k, l]) => (
          <Link key={k} href={`/community?tab=feed${k === "all" ? "&scope=all" : ""}`} className={cn("rounded-full px-3.5 py-1.5 text-[12.5px] font-bold", (k === "all") === everyone ? "bg-cream-blush text-frost-deep" : "text-plum-muted hover:text-plum")}>{l}</Link>
        ))}
      </div>
      {rows.length === 0 && <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">{everyone ? "Nothing yet. Go rate something!" : "Follow a few members and their activity lands here."} <Link href="/community?tab=members" className="text-frost-text">Find people →</Link></p>}
      <ol className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-[44px_1fr_44px] items-center gap-3 rounded-3xl border-1.5 border-line bg-cream-card p-2.5 pr-3">
            <Link href={`/u/${r.handle}`}><Avatar src={r.avatar_url} name={r.handle} size={44} ring={r.accent} /></Link>
            <div className="min-w-0 text-[13.5px] leading-snug">
              <div className="line-clamp-2"><Link href={`/u/${r.handle}`} className="font-extrabold hover:text-frost-text">{r.display_name}</Link> {describe(r)}</div>
              {r.kind === "comment" && r.detail && <div className="mt-0.5 line-clamp-1 text-[12.5px] text-plum-muted">“{r.detail}”</div>}
              <div className="text-[11.5px] font-semibold text-plum-faint">{ago(r.created_at)}</div>
            </div>
            {r.mal_id ? <Link href={r.episode ? `/watch/${r.mal_id}/${r.episode}` : `/anime/${r.mal_id}`}><Poster src={r.image} className="h-[58px] w-11 rounded-lg" /></Link> : <span />}
          </li>
        ))}
      </ol>
    </div>
  );
}

async function Members({ q }: { q?: string }) {
  const term = (q ?? "").trim().replace(/[%_]/g, "");
  const rows = await all<{ handle: string; display_name: string; avatar_url: string | null; accent: string; bio: string; is_plus: number; last_seen: number; online: number; entries: number; followers: number }>(
    `select u.handle, u.display_name, u.avatar_url, u.accent, u.bio, u.is_plus, u.last_seen,
            exists(select 1 from presence p where p.user_id = u.id and p.updated_at > unixepoch() - 90) as online,
            (select count(*) from library l where l.user_id = u.id) as entries,
            (select count(*) from follows f where f.followee_id = u.id) as followers
     from users u ${term ? "where u.handle like ?1 or u.display_name like ?1" : ""}
     order by online desc, u.last_seen desc limit 90`,
    ...(term ? [`%${term}%`] : []),
  );
  return (
    <div className="flex flex-col gap-4">
      <form className="relative">
        <input type="hidden" name="tab" value="members" />
        <input name="q" defaultValue={q} placeholder="Find a member by handle or name…" className="h-12 w-full rounded-full border-1.5 border-line bg-cream-card px-5 text-[14.5px] font-semibold outline-none focus:border-frost-hot focus:shadow-halo" />
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((u) => (
          <Link key={u.handle} href={`/u/${u.handle}`} className="spotlight flex flex-col gap-3 rounded-3xl border-1.5 border-line bg-cream-card p-4 transition hover:border-frost-hot">
            <div className="flex items-center gap-3">
              <span className="relative">
                <Avatar src={u.avatar_url} name={u.handle} size={52} ring={u.accent} />
                {u.online ? <span className="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-cream-card bg-sprinkle-mint" /> : null}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1 truncate text-[15px] font-extrabold">{u.display_name}{u.is_plus ? <Crown className="size-3.5 text-sprinkle-star" /> : null}</div>
                <div className="truncate text-[12.5px] font-semibold" style={{ color: u.accent }}>@{u.handle}</div>
              </div>
            </div>
            {u.bio && <p className="line-clamp-2 text-[12.5px] text-plum-muted">{u.bio}</p>}
            <div className="mt-auto flex gap-3 text-[12px] font-bold text-plum-body">
              <span>{u.entries} in box</span><span>{u.followers} followers</span>
              <span className="ml-auto text-plum-faint">{u.online ? "online" : ago(u.last_seen)}</span>
            </div>
          </Link>
        ))}
      </div>
      {rows.length === 0 && <p className="text-center font-semibold text-plum-muted">No one by that name.</p>}
    </div>
  );
}

// seconds → a compact "3d 5h" / "12h 30m" / "45m" duration.
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

async function Board() {
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const q = (kind: string) =>
    all<{ handle: string; display_name: string; avatar_url: string | null; accent: string; n: number }>(
      `select u.handle, u.display_name, u.avatar_url, u.accent, count(*) as n from activity a join users u on u.id = a.user_id
       where a.kind = ? and a.created_at > ? group by a.user_id order by n desc limit 10`,
      kind, since,
    );
  const time = all<{ handle: string; display_name: string; avatar_url: string | null; accent: string; n: number }>(
    `select u.handle, u.display_name, u.avatar_url, u.accent, coalesce(sum(t.seconds), 0) as n
     from time_spent t join users u on u.id = t.user_id
     where t.day >= date('now', '-30 days') group by t.user_id order by n desc limit 10`,
  ).catch(() => []);
  const [eps, cms, rates, mins] = await Promise.all([q("finished_episode"), q("comment"), q("rated"), time]);
  const boards = [
    { title: "Most episodes", unit: "eps", Icon: Tv, rows: eps },
    { title: "Chattiest", unit: "comments", Icon: MessageSquare, rows: cms },
    { title: "Top critics", unit: "ratings", Icon: Star, rows: rates },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[13px] font-semibold text-plum-muted">The last 30 days.</p>
      <section className="rounded-box border-1.5 border-line bg-cream-card p-4 sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 px-1 text-[18px] font-extrabold"><Clock className="size-5 text-frost-hot" />Time on cupcake</h2>
        {mins.length === 0 ? (
          <p className="px-1 py-4 text-[13px] text-plum-muted">Up for grabs — hang around and climb.</p>
        ) : (
          <ol className="grid gap-1 sm:grid-cols-2">
            {mins.map((r, i) => (
              <li key={r.handle}>
                <Link href={`/u/${r.handle}`} className="grid grid-cols-[28px_40px_1fr_auto] items-center gap-2.5 rounded-2xl p-1.5 hover:bg-cream-tint">
                  <span className="grid place-items-center">{i < 3 ? <Medal className={cn("size-5", ["text-sprinkle-star", "text-plum-faint", "text-sprinkle-peach"][i])} /> : <span className="font-mono text-[13px] text-plum-faint">{i + 1}</span>}</span>
                  <Avatar src={r.avatar_url} name={r.handle} size={40} ring={r.accent} />
                  <span className="truncate text-[14px] font-extrabold">{r.display_name}</span>
                  <span className="font-mono text-[13.5px] text-frost-text">{fmtDur(Number(r.n))}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        {boards.map(({ title, unit, Icon, rows }) => (
          <section key={title} className="rounded-box border-1.5 border-line bg-cream-card p-4">
            <h2 className="mb-3 flex items-center gap-2 px-1 text-[17px] font-extrabold"><Icon className="size-4 text-frost-hot" />{title}</h2>
            {rows.length === 0 && <p className="px-1 py-4 text-[13px] text-plum-muted">Up for grabs.</p>}
            <ol className="flex flex-col gap-1">
              {rows.map((r, i) => (
                <li key={r.handle}>
                  <Link href={`/u/${r.handle}`} className="grid grid-cols-[28px_36px_1fr_auto] items-center gap-2.5 rounded-2xl p-1.5 hover:bg-cream-tint">
                    <span className="grid place-items-center">{i < 3 ? <Medal className={cn("size-5", ["text-sprinkle-star", "text-plum-faint", "text-sprinkle-peach"][i])} /> : <span className="font-mono text-[13px] text-plum-faint">{i + 1}</span>}</span>
                    <Avatar src={r.avatar_url} name={r.handle} size={36} ring={r.accent} />
                    <span className="truncate text-[13.5px] font-extrabold">{r.display_name}</span>
                    <span className="font-mono text-[13px] text-frost-text">{r.n} <span className="text-[10.5px] text-plum-muted">{unit}</span></span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
