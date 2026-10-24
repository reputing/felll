import Link from "next/link";
import { ArrowLeft, Flame, Sparkles, Star } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { all } from "@/lib/db";
import { getCachedAnime } from "@/lib/jikan";
import { memberStats } from "@/lib/stats";
import { computeBadges } from "@/lib/badges";
import { Avatar } from "@/components/avatar";
import { Poster } from "@/components/poster";
import { ShareButton } from "@/components/share";

export const metadata = { title: "Your Wrapped" };

// A verdict on someone's taste, from their biggest genre + how deep they're in.
function vibe(genre: string | null, hours: number): string {
  if (!genre) return "The Fresh Start";
  if (hours >= 500) return `The ${genre} Lifer`;
  if (hours >= 100) return `The ${genre} Devotee`;
  if (hours >= 20) return `The ${genre} Regular`;
  return `The ${genre} Curious`;
}

export default async function Wrapped() {
  const me = await requireMember("/wrapped");
  const accent = me.accent;
  const [stats, rows] = await Promise.all([
    memberStats(me.id),
    all<{ mal_id: number; title: string; image: string | null; status: string | null; score: number | null; favorite: number; progress: number }>(
      "select mal_id, title, image, status, score, favorite, progress from library where user_id = ? order by favorite desc, score desc, progress desc limit 120",
      me.id,
    ),
  ]);

  const cached = await getCachedAnime(rows.slice(0, 90).map((r) => r.mal_id));
  const genreCount: Record<string, number> = {};
  for (const r of rows) {
    const a = cached.get(r.mal_id);
    if (a && (r.status === "completed" || r.status === "watching" || r.favorite)) for (const g of a.genres) genreCount[g] = (genreCount[g] ?? 0) + 1;
  }
  const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
  const topShows = rows.filter((r) => r.image).slice(0, 5);
  const earnedBadges = computeBadges(stats).filter((b) => b.earned);
  const title = vibe(topGenres[0] ?? null, stats.hours);

  const big = [
    { k: "Hours watched", v: stats.hours.toLocaleString() },
    { k: "Episodes", v: stats.episodes.toLocaleString() },
    { k: "Completed", v: stats.completed.toLocaleString() },
    { k: "Mean score", v: stats.mean ?? "–" },
  ];

  return (
    <div className="mx-auto flex max-w-[840px] flex-col gap-5 px-3 pb-16 pt-4 sm:px-5" style={{ ["--accent" as string]: accent }}>
      <div className="flex items-center justify-between px-1">
        <Link href="/home" className="flex items-center gap-1.5 text-[13.5px] font-bold text-plum-muted hover:text-frost-text"><ArrowLeft className="size-4" />Home</Link>
        <ShareButton path="/wrapped" title={`My cupcake Wrapped: ${title}`} variant="outline" />
      </div>

      {/* the shareable card */}
      <section className="relative overflow-hidden rounded-[32px] border-1.5 border-night-line bg-night p-7 text-night-text shadow-[0_40px_80px_-40px_rgba(0,0,0,.8)] sm:p-10">
        <div aria-hidden className="absolute -right-24 -top-24 size-72 rounded-full blur-3xl" style={{ background: `color-mix(in srgb, ${accent} 55%, transparent)` }} />
        <div aria-hidden className="absolute -bottom-28 -left-24 size-72 rounded-full blur-3xl" style={{ background: "color-mix(in srgb, var(--frost-hot) 40%, transparent)" }} />

        <div className="relative flex flex-col gap-7">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[.2em] text-night-muted"><Sparkles className="size-4" style={{ color: accent }} />cupcake wrapped</span>
            <span className="text-base font-extrabold tracking-[-.5px] text-frost-brand">cupcake<span className="text-night-muted">.gg</span></span>
          </div>

          <div className="flex items-center gap-4">
            <Avatar src={me.avatar_url} name={me.handle} size={64} ring={accent} />
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-night-muted">@{me.handle}</div>
              <h1 className="text-balance text-[clamp(30px,6vw,52px)] font-extrabold leading-[0.98] tracking-[-1.5px]" style={{ color: accent }}>{title}</h1>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {big.map((s) => (
              <div key={s.k} className="rounded-2xl border border-night-edge bg-white/[.03] px-4 py-3.5">
                <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-night-muted">{s.k}</dt>
                <dd className="mt-1 font-mono text-[26px] leading-none">{s.v}</dd>
              </div>
            ))}
          </dl>

          {topShows.length > 0 && (
            <div>
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[.14em] text-night-muted">The ones that defined it</div>
              <div className="grid grid-cols-5 gap-2.5">
                {topShows.map((r) => (
                  <Link key={r.mal_id} href={`/anime/${r.mal_id}`} title={r.title} className="group">
                    <Poster src={r.image} className="aspect-[2/3] rounded-xl border border-night-edge transition group-hover:-translate-y-1" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {topGenres.map((g) => (
              <span key={g} className="rounded-full border border-night-edge px-3 py-1.5 text-[12.5px] font-bold" style={{ color: accent }}>{g}</span>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-night-line pt-5 text-[13px] font-bold">
            {stats.streak > 1 ? <span className="flex items-center gap-1.5 text-sprinkle-peach"><Flame className="size-4" />{stats.streak}-day streak</span> : <span className="text-night-muted">just getting started</span>}
            <span className="flex items-center gap-1.5 text-night-muted"><Star className="size-4" style={{ color: accent }} />{earnedBadges.length} badges · {stats.favs} favourites</span>
          </div>
        </div>
      </section>

      <p className="px-1 text-center text-[13px] font-semibold text-plum-muted">Share your Wrapped and drag your friends onto cupcake. 🧁</p>
    </div>
  );
}
