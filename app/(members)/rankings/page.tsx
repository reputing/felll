import Link from "next/link";
import { Suspense } from "react";
import { Crown, Heart, Users } from "lucide-react";
import { all } from "@/lib/db";
import { formatLabel, getTop, TOP_LISTS, type TopList } from "@/lib/jikan";
import { cn, compact } from "@/lib/utils";
import { PageHead } from "@/components/page-head";
import { Pager } from "@/components/pager";
import { Poster } from "@/components/poster";
import { SaveToggle } from "@/components/save-toggle";

export const metadata = { title: "Rankings" };

type SP = { list?: string; page?: string };
const LISTS = { ...Object.fromEntries(Object.entries(TOP_LISTS).map(([k, v]) => [k, v.label])), cupcake: "cupcake’s favourites" } as Record<string, string>;

export default async function Rankings({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const list = sp.list && sp.list in LISTS ? sp.list : "airing";
  const page = Math.max(1, Number(sp.page) || 1);
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="Ranked" title="The charts" sub="The global rankings, plus what cupcake members rate highest." />
      <nav aria-label="ranking lists" className="scrollbar-none flex gap-1.5 overflow-x-auto">
        {Object.entries(LISTS).map(([k, l]) => (
          <Link key={k} href={`/rankings?list=${k}`} aria-current={k === list ? "page" : undefined}
            className={cn("flex h-10 flex-none items-center gap-1.5 rounded-full border-1.5 border-line bg-cream-card px-4 text-[13px] font-bold hover:border-frost-hot", k === list && "border-frost-hot bg-frost text-frost-ink")}>
            {k === "cupcake" && <Crown className="size-3.5" />}{l}
          </Link>
        ))}
      </nav>
      <Suspense key={list + page} fallback={<div className="flex flex-col gap-2">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-[92px] rounded-3xl skeleton" />)}</div>}>
        {list === "cupcake" ? <Community /> : <Top list={list as TopList} page={page} />}
      </Suspense>
    </div>
  );
}

function Row({ rank, id, title, image, sub, score, right }: { rank: number; id: number; title: string; image: string | null; sub: string; score: string; right: React.ReactNode }) {
  return (
    <li className="spotlight grid grid-cols-[52px_56px_1fr_auto] items-center gap-3 rounded-3xl border-1.5 border-line bg-cream-card p-2.5 pr-4 transition hover:border-line-hot sm:grid-cols-[72px_56px_1fr_auto]">
      <span className={cn("text-center font-mono text-[26px] font-medium tracking-tight sm:text-[32px]", rank <= 3 ? "text-frost-text" : "text-plum-faint")}>{rank}</span>
      <Link href={`/anime/${id}`}><Poster src={image} className="h-[78px] w-14 rounded-xl" /></Link>
      <span className="min-w-0">
        <Link href={`/anime/${id}`} className="line-clamp-1 text-[15.5px] font-extrabold hover:text-frost-text">{title}</Link>
        <span className="line-clamp-1 text-[12.5px] font-semibold text-plum-muted">{sub}</span>
        <span className="mt-1 flex items-center gap-1.5 text-[13px] font-extrabold"><span className="text-sprinkle-star">★</span>{score}</span>
      </span>
      <span className="flex items-center gap-3">{right}</span>
    </li>
  );
}

async function Top({ list, page }: { list: TopList; page: number }) {
  const res = await getTop(list, page);
  if (!res.items.length) return <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">The charts aren’t answering right now.</p>;
  return (
    <>
      <ol className="flex flex-col gap-2">
        {res.items.map((a, i) => (
          <Row key={a.id} rank={(page - 1) * 25 + i + 1} id={a.id} title={a.title} image={a.posterSm} score={a.score}
            sub={[formatLabel(a), a.episodes ? `${a.episodes} eps` : null, a.year, a.studio, a.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}
            right={<>
              <span className="hidden flex-col items-end text-[12px] font-bold text-plum-muted sm:flex"><span className="flex items-center gap-1"><Users className="size-3.5" />{compact(a.members)}</span><span className="flex items-center gap-1"><Heart className="size-3.5" />{compact(a.favorites)}</span></span>
              <SaveToggle a={{ id: a.id, title: a.title, poster: a.posterSm, episodes: a.episodes, format: a.format }} />
            </>} />
        ))}
      </ol>
      <Pager page={page} last={Math.min(res.lastPage, 40)} href={(p) => `/rankings?list=${list}&page=${p}`} />
    </>
  );
}

async function Community() {
  const rows = await all<{ mal_id: number; title: string; image: string | null; avg: number; n: number; saves: number; favs: number }>(
    `select mal_id, max(title) as title, max(image) as image, avg(score) as avg, count(score) as n, count(*) as saves, sum(favorite) as favs
     from library group by mal_id having count(score) >= 1 order by (avg(score) * count(score) + 7 * 3) / (count(score) + 3) desc, count(*) desc limit 50`,
  );
  if (!rows.length) return <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-10 text-center font-semibold text-plum-muted">No one’s rated anything yet. Rate a few shows and this chart comes alive.</p>;
  return (
    <ol className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <Row key={r.mal_id} rank={i + 1} id={r.mal_id} title={r.title} image={r.image} score={r.avg.toFixed(2)}
          sub={`${r.n} rating${r.n === 1 ? "" : "s"} · ${r.saves} in boxes · ${r.favs} favourites`}
          right={<SaveToggle a={{ id: r.mal_id, title: r.title, poster: r.image, episodes: null, format: "TV" }} />} />
      ))}
    </ol>
  );
}
