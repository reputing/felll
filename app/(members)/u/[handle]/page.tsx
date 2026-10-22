import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Crown, Flame, Lock, MessageSquare, Pencil, Radio, Sparkles } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { all, db, first } from "@/lib/db";
import { getCachedAnime } from "@/lib/jikan";
import { memberStats } from "@/lib/stats";
import { computeBadges } from "@/lib/badges";
import { ago, cn } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Poster } from "@/components/poster";
import { BoxGrid, type BoxRow } from "@/components/box/box-grid";
import { FollowButton } from "@/components/profile/follow-button";
import { describe } from "@/components/home/friends-now";
import type { User } from "@/lib/auth";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `@${(await params).handle}` };
}

export default async function Profile({ params }: Props) {
  const handle = decodeURIComponent((await params).handle).toLowerCase();
  const me = await requireMember(`/u/${handle}`);
  const u = await first<User>("select * from users where handle = ?", handle);
  if (!u) notFound();
  const self = u.id === me.id;
  const d = await db();
  const [[counts, following, live], stats, rows, activity, comments] = await Promise.all([
    d.batch<Record<string, number | string | null>>([
      d.prepare("select (select count(*) from follows where followee_id = ?1) as followers, (select count(*) from follows where follower_id = ?1) as following").bind(u.id),
      d.prepare("select count(*) as n from follows where follower_id = ? and followee_id = ?").bind(me.id, u.id),
      d.prepare("select mal_id, episode, title from presence where user_id = ? and updated_at > unixepoch() - 90").bind(u.id),
    ]),
    memberStats(u.id),
    all<BoxRow>("select mal_id, title, image, episodes, kind, updated_at, status, score, favorite, progress from library where user_id = ? order by updated_at desc", u.id),
    all<{ kind: string; mal_id: number | null; episode: number | null; title: string | null; image: string | null; detail: string | null; created_at: number }>(
      "select kind, mal_id, episode, title, image, detail, created_at from activity where user_id = ? order by created_at desc limit 14", u.id),
    all<{ id: number; mal_id: number; episode: number | null; body: string; spoiler: number; created_at: number; likes: number }>(
      "select id, mal_id, episode, body, spoiler, created_at, likes from comments where user_id = ? and deleted = 0 order by created_at desc limit 5", u.id),
  ]);
  const c = counts.results[0] as { followers: number; following: number };
  const now = live.results[0] as { mal_id: number | null; episode: number | null; title: string | null } | undefined;
  const showcaseIds: number[] = (() => { try { return JSON.parse(u.showcase); } catch { return []; } })();
  const showcase = showcaseIds.map((id) => rows.find((r) => r.mal_id === id)).filter(Boolean) as BoxRow[];
  const favs = rows.filter((r) => r.favorite);
  const hidden = !!u.private_lists && !self;

  // genre mix from whatever of their list is already in the cache (no live calls)
  const cached = await getCachedAnime(rows.filter((r) => r.status === "completed" || r.status === "watching" || r.favorite).slice(0, 80).map((r) => r.mal_id));
  const genreCount: Record<string, number> = {};
  for (const a of cached.values()) for (const g of a.genres) genreCount[g] = (genreCount[g] ?? 0) + 1;
  const genres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const gMax = genres[0]?.[1] ?? 1;

  const accent = u.accent;
  const badges = computeBadges(stats);
  const earnedBadges = badges.filter((b) => b.earned).length;
  const tiles = [
    { k: "Completed", v: stats.completed },
    { k: "Episodes", v: stats.episodes },
    { k: "Hours", v: stats.hours },
    { k: "Mean score", v: stats.mean ?? "–" },
    { k: "Ratings", v: stats.rated },
    { k: "Comments", v: stats.comments },
  ];

  return (
    <div className="mx-auto flex max-w-[1300px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5" style={{ ["--accent" as string]: accent }}>
      <section className="relative overflow-hidden rounded-shell border-1.5 border-night-line bg-night text-night-text">
        <div className="relative h-[220px] sm:h-[280px]" style={{ background: `linear-gradient(135deg, ${accent}, var(--night))` }}>
          {u.banner_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.banner_url} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
          )}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-night via-night/30 to-transparent" />
        </div>
        <div className="relative -mt-20 flex flex-wrap items-end gap-5 px-5 pb-6 sm:px-8">
          <Avatar src={u.avatar_url} name={u.handle} size={132} ring={accent} className="border-4 border-night" />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="flex items-center gap-2 text-[clamp(28px,3.4vw,40px)] font-extrabold leading-tight tracking-[-1.2px]">
              {u.display_name}{u.is_plus ? <Crown className="size-6 text-sprinkle-star" /> : null}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] font-semibold text-night-muted">
              <span style={{ color: accent }}>@{u.handle}</span>
              {u.pronouns && <span>{u.pronouns}</span>}
              <span className="flex items-center gap-1"><CalendarDays className="size-3.5" />joined {new Date(u.created_at * 1000).toLocaleDateString("en", { month: "short", year: "numeric" })}</span>
              <span><b className="text-night-text">{c.followers}</b> followers · <b className="text-night-text">{c.following}</b> following</span>
              {stats.streak > 1 && <span className="flex items-center gap-1 text-sprinkle-peach"><Flame className="size-3.5" />{stats.streak}-day streak</span>}
            </div>
          </div>
          <div className="flex gap-2 pb-1">
            {self ? (
              <Button variant="night" size="lg" asChild><Link href="/settings"><Pencil className="size-4" />Customize</Link></Button>
            ) : (
              <FollowButton handle={u.handle} following={Number((following.results[0] as { n: number }).n) > 0} followers={c.followers} />
            )}
          </div>
        </div>
        {(u.bio || u.status_text || now?.title) && (
          <div className="relative grid gap-3 border-t border-night-line px-5 py-5 sm:px-8 md:grid-cols-[1fr_auto]">
            {u.bio ? <p className="max-w-[70ch] whitespace-pre-line text-[14.5px] leading-relaxed text-night-muted">{u.bio}</p> : <span />}
            <div className="flex flex-col items-start gap-2 md:items-end">
              {now?.title ? (
                <Link href={now.mal_id && now.episode ? `/watch/${now.mal_id}/${now.episode}` : "#"} className="flex items-center gap-2 rounded-full border border-night-edge px-3.5 py-1.5 text-[12.5px] font-bold hover:border-frost">
                  <span className="size-2 rounded-full bg-sprinkle-mint animate-pulse-dot" />watching {now.title}{now.episode ? ` · ep ${now.episode}` : ""}
                </Link>
              ) : null}
              {u.status_text && <span className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold" style={{ background: `color-mix(in srgb, ${accent} 22%, transparent)`, color: accent }}><Sparkles className="size-3.5" />{u.status_text}</span>}
            </div>
          </div>
        )}
      </section>

      <dl className="grid grid-cols-3 gap-2.5 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-3xl border-1.5 border-line bg-cream-card px-4 py-3.5">
            <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-plum-muted">{t.k}</dt>
            <dd className="mt-1 font-mono text-[24px] leading-none" style={{ color: accent }}>{t.v}</dd>
          </div>
        ))}
      </dl>

      <section className="rounded-box border-1.5 border-line bg-cream-card p-5">
        <div className="flex items-end justify-between">
          <div><div className="eyebrow">Achievements</div><h2 className="mt-1 text-xl font-extrabold tracking-[-.6px]">Badges</h2></div>
          <div className="flex items-center gap-3">
            {self && <Link href="/wrapped" className="flex items-center gap-1.5 rounded-full border-1.5 border-line bg-paper px-3 py-1.5 text-[12.5px] font-bold text-frost-text hover:border-frost-hot"><Sparkles className="size-3.5" />Your Wrapped</Link>}
            <span className="font-mono text-[13px] text-plum-muted">{earnedBadges}/{badges.length}</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {badges.map((b) => (
            <div key={b.key} title={b.earned ? b.desc : `Locked · ${b.desc}`} className={cn("flex items-center gap-2.5 rounded-2xl border-1.5 p-2.5 transition", b.earned ? "border-line bg-paper" : "border-dashed border-line-soft opacity-40 grayscale")}>
              <span className="grid size-9 flex-none place-items-center rounded-xl bg-cream-tint text-[18px]">{b.icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-extrabold">{b.label}</span>
                <span className="block truncate text-[11px] font-semibold text-plum-muted">{b.desc}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {showcase.length > 0 && (
            <section className="rounded-box border-1.5 border-line bg-cream-card p-5">
              <div className="eyebrow">Showcase</div>
              <h2 className="mb-4 mt-1 text-xl font-extrabold tracking-[-.6px]">The ones that matter</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {showcase.map((r, i) => (
                  <Link key={r.mal_id} href={`/anime/${r.mal_id}`} className="group relative">
                    <Poster src={r.image} className="aspect-[2/3] rounded-[20px] border-1.5 border-line shadow-poster transition duration-300 group-hover:-translate-y-1 group-hover:rotate-[-1deg]" />
                    <span className="absolute left-2 top-2 grid size-8 place-items-center rounded-xl font-mono text-[14px] text-white" style={{ background: accent }}>{i + 1}</span>
                    <div className="mt-2 line-clamp-2 text-[13px] font-extrabold leading-tight">{r.title}</div>
                    {r.score ? <div className="text-[12px] font-bold text-plum-muted">★ {r.score}/10</div> : null}
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section className="flex flex-col gap-3">
            <h2 className="px-1 text-xl font-extrabold tracking-[-.6px]">{self ? "Your box" : `${u.display_name}’s box`}</h2>
            {hidden ? (
              <p className="flex items-center justify-center gap-2 rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 font-semibold text-plum-muted"><Lock className="size-4" />Their lists are private.</p>
            ) : (
              <BoxGrid rows={rows} readOnly={!self} initialTab={rows.some((r) => r.status === "watching") ? "watching" : "all"} />
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          {genres.length > 0 && (
            <section className="rounded-box border-1.5 border-line bg-cream-card p-5">
              <div className="eyebrow mb-3">Genre mix</div>
              <ul className="flex flex-col gap-2">
                {genres.map(([g, n]) => (
                  <li key={g} className="grid grid-cols-[96px_1fr_24px] items-center gap-2 text-[12.5px] font-bold">
                    <span className="truncate">{g}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-cream-tint"><span className="block h-full rounded-full" style={{ width: `${(n / gMax) * 100}%`, background: accent }} /></span>
                    <span className="text-right font-mono text-plum-muted">{n}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {favs.length > 0 && !hidden && (
            <section className="rounded-box border-1.5 border-line bg-cream-card p-5">
              <div className="eyebrow mb-3">Favourites · {favs.length}</div>
              <div className="grid grid-cols-4 gap-2">
                {favs.slice(0, 12).map((r) => <Link key={r.mal_id} href={`/anime/${r.mal_id}`} title={r.title}><Poster src={r.image} className="aspect-[2/3] rounded-xl transition hover:-translate-y-0.5" /></Link>)}
              </div>
            </section>
          )}
          <section className="rounded-box border-1.5 border-line bg-cream-card p-5">
            <div className="eyebrow mb-3 flex items-center gap-1.5"><Radio className="size-3" />Activity</div>
            {activity.length === 0 && <p className="text-[13px] text-plum-muted">Quiet so far.</p>}
            <ol className="flex flex-col gap-3">
              {activity.map((a, i) => (
                <li key={i} className="grid grid-cols-[30px_1fr] gap-2.5 text-[12.5px] leading-snug">
                  {a.image ? <Poster src={a.image} className="h-10 w-[30px] rounded-lg" /> : <span className="grid h-10 w-[30px] place-items-center rounded-lg bg-cream-tint">✿</span>}
                  <span><span className="line-clamp-2">{describe(a)}</span><span className="text-[11px] font-semibold text-plum-muted">{ago(a.created_at)}</span></span>
                </li>
              ))}
            </ol>
          </section>
          {comments.length > 0 && (
            <section className="rounded-box border-1.5 border-line bg-cream-card p-5">
              <div className="eyebrow mb-3 flex items-center gap-1.5"><MessageSquare className="size-3" />Latest comments</div>
              <ul className="flex flex-col gap-2.5">
                {comments.map((cm) => (
                  <li key={cm.id}>
                    <Link href={`${cm.episode ? `/watch/${cm.mal_id}/${cm.episode}` : `/anime/${cm.mal_id}`}#c${cm.id}`} className="block rounded-2xl bg-cream-tint px-3.5 py-2.5 text-[13px] hover:bg-cream-blush">
                      <span className="line-clamp-2">{cm.spoiler ? "‹spoiler›" : cm.body}</span>
                      <span className="text-[11px] font-semibold text-plum-muted">{ago(cm.created_at)} · ♥ {cm.likes}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
