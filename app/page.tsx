import { ArrowRight, CalendarClock, Heart, MessagesSquare, Radio, Sparkles, Star, Tv } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, safeNext } from "@/lib/auth";
import { all } from "@/lib/db";
import { jikanOr, normAnime } from "@/lib/jikan";
import { kuroConfig } from "@/lib/kuro";
import { compact } from "@/lib/utils";
import { LoginForm } from "@/components/portal/login-form";
import { PosterWall } from "@/components/portal/poster-wall";
import { Avatar } from "@/components/avatar";

export const metadata = { title: "The portal" };

const ERRORS: Record<string, string> = {
  expired: "That sign-in link expired. Give it another go.",
  used: "That sign-in link was already used. Give it another go.",
  no_account: "We couldn’t find that kuro account.",
  plus_only: "cupcake is open to kuro+ members right now.",
  sso_off: "One-click sign-in isn’t set up yet. Use your handle and password below.",
};

const FEATURES = [
  { Icon: Tv, label: "Watch together-ish", note: "see who’s on the same episode" },
  { Icon: Star, label: "Rate everything", note: "1–10, with the crowd’s take" },
  { Icon: MessagesSquare, label: "Episode threads", note: "spoiler tags included" },
  { Icon: CalendarClock, label: "Drop timers", note: "every airing show, live" },
  { Icon: Heart, label: "Your box", note: "lists, favourites, history" },
  { Icon: Sparkles, label: "Your page", note: "banner, showcase, skins" },
];

type Props = { searchParams: Promise<{ next?: string; error?: string; sso?: string; bye?: string }> };

export default async function Portal({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await currentUser()) redirect(next);

  const [wall, stats, faces, cfg] = await Promise.all([
    jikanOr<{ data: unknown[] }>("/top/anime?filter=airing&limit=25&sfw=true", { data: [] }, 3600),
    all<{ online: number; members: number; ratings: number }>(
      `select (select count(*) from presence where updated_at > unixepoch() - 90) as online,
              (select count(*) from users) as members,
              (select count(*) from library where score is not null) as ratings`,
    ).catch(() => []),
    all<{ handle: string; avatar_url: string | null }>(
      "select handle, avatar_url from users order by last_seen desc limit 5",
    ).catch(() => []),
    kuroConfig(),
  ]);
  const posters = (wall.data ?? []).map(normAnime);
  const s = stats[0] ?? { online: 0, members: 0, ratings: 0 };
  const error = sp.error ? ERRORS[sp.error] : sp.sso ? "You’re not signed in on kuro yet. Sign in there, or use your handle below." : null;
  const dev = process.env.NODE_ENV !== "production";

  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden px-4 py-10">
      <PosterWall items={posters} />
      <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 size-[480px] rounded-full bg-frost/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-24 size-[520px] rounded-full bg-sprinkle-lilac/20 blur-3xl" />

      <div className="relative z-10 grid w-full max-w-[980px] items-stretch gap-4 animate-rise lg:grid-cols-[1.05fr_1fr]">
        <section className="flex flex-col justify-between gap-8 rounded-shell border-1.5 border-night-line bg-night p-8 text-night-text shadow-[0_40px_80px_-40px_rgba(42,20,32,.9)]">
          <div>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/cupcake.png" alt="" width={56} height={56} className="size-14 animate-float drop-shadow-[0_6px_14px_rgb(var(--glow)/.4)]" />
              <span className="text-[30px] font-extrabold leading-none tracking-[-1.2px] text-frost">
                cupcake<span className="text-2xl font-semibold tracking-[-.5px] text-night-muted/70">.gg</span>
              </span>
            </div>
            <p className="mt-8 text-[11px] font-bold uppercase tracking-[.18em] text-frost">the portal · kuro members only</p>
            <h1 className="mt-3 text-balance text-[clamp(34px,4.4vw,52px)] font-extrabold leading-[0.98] tracking-[-2px]">
              Every anime on your list, in one little box.
            </h1>
            <p className="mt-4 max-w-[46ch] text-pretty text-[15px] leading-relaxed text-night-muted">
              Pick up where you left off, keep up with what&apos;s airing, and watch it together with the rest of kuro. Sign in with your kuro account to come in.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-2">
            {FEATURES.map(({ Icon, label, note }) => (
              <li key={label} className="rounded-2xl border border-night-line bg-night-line/40 p-3">
                <Icon className="size-4 text-frost" />
                <div className="mt-2 text-[13px] font-extrabold">{label}</div>
                <div className="text-[11.5px] text-night-muted/80">{note}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-5 rounded-shell border-1.5 border-line bg-cream-card/95 p-7 shadow-shell backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 rounded-full border-1.5 border-line bg-paper px-3 py-1.5 text-[12px] font-bold text-plum-body">
              <span className="size-2 rounded-full bg-sprinkle-mint animate-pulse-dot" /> {compact(s.online)} online now
            </span>
            {faces.length > 0 && (
              <span className="flex -space-x-2">
                {faces.map((f) => <Avatar key={f.handle} src={f.avatar_url} name={f.handle} size={28} className="ring-2 ring-cream-card" />)}
              </span>
            )}
          </div>

          <div>
            <h2 className="text-[26px] font-extrabold tracking-[-.8px] text-frost-deep">Step inside.</h2>
            <p className="mt-1 text-[13.5px] font-medium text-plum-muted">Sign in with the account you use on {cfg.url.replace(/^https?:\/\//, "")}.</p>
          </div>

          {error && <p role="alert" className="rounded-2xl border-1.5 border-line-hot bg-cream-blush px-4 py-3 text-[13px] font-bold text-frost-deep">{error}</p>}
          {sp.bye && !error && <p className="rounded-2xl bg-cream-tint px-4 py-3 text-[13px] font-bold text-plum-body">Signed out. See you soon.</p>}

          <Link
            href={`/api/auth/kuro?next=${encodeURIComponent(next)}`}
            prefetch={false}
            className="group relative flex h-14 items-center justify-center gap-3 overflow-hidden rounded-2xl bg-night text-[15px] font-extrabold text-night-text shadow-[inset_0_-3px_0_rgba(0,0,0,.35)] transition hover:brightness-110"
          >
            <span aria-hidden className="absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,.12)_50%,transparent_70%)] bg-[length:200%_100%] animate-shimmer" />
            <span className="grid size-7 place-items-center rounded-lg bg-frost text-[13px] font-black text-frost-ink">k</span>
            Continue with kuro
            <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </Link>

          <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[.14em] text-plum-faint">
            <span className="h-px flex-1 bg-line" /> or with your handle <span className="h-px flex-1 bg-line" />
          </div>

          <LoginForm next={next} />

          {dev && (
            <form action="/api/auth/dev" method="post" className="flex gap-2 rounded-2xl border-1.5 border-dashed border-line p-2">
              <input name="handle" placeholder="dev handle" className="h-9 min-w-0 flex-1 rounded-xl bg-paper px-3 text-[13px] font-semibold outline-none" />
              <button className="h-9 rounded-xl bg-cream-blush px-3 text-[12.5px] font-extrabold text-frost-deep">Dev sign-in</button>
            </form>
          )}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t-1.5 border-line-soft pt-4 text-[12.5px] font-semibold text-plum-muted">
            <span><b className="text-plum">{compact(s.members)}</b> members · <b className="text-plum">{compact(s.ratings)}</b> ratings</span>
            <a href={`${cfg.url}/?signup=1`} className="flex items-center gap-1 font-bold text-frost-text hover:text-frost-deep">
              <Radio className="size-3.5" /> Not on kuro yet? Join
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
