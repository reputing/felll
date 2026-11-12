import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink, User } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { personPage } from "@/lib/people";
import { Poster } from "@/components/poster";

type Props = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: decodeURIComponent((await params).name) };
}

// A cast or crew member: photo, bio, and every film and series they are credited in, each one a link to its page here.
// The titles link as /movies/t-<imdb> because the data does not say whether one is a film or a series; that page works
// it out and redirects.
export default async function PersonPage({ params }: Props) {
  const name = decodeURIComponent((await params).name).slice(0, 80);
  await requireMember(`/movies/person/${encodeURIComponent(name)}`);
  const p = await personPage(name);
  if (!p) notFound();
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <nav aria-label="breadcrumb" className="flex items-center gap-1.5 px-1 text-[12.5px] font-bold text-plum-muted">
        <Link href="/movies" className="hover:text-frost-text">Movies &amp; Series</Link>
        <ChevronRight className="size-3.5" /><span className="truncate text-frost-text">{p.name}</span>
      </nav>
      <div className="grid gap-6 rounded-box border-1.5 border-line bg-cream-card p-5 sm:grid-cols-[180px_1fr] sm:p-6">
        <span className="relative grid aspect-[3/4] w-[180px] place-items-center overflow-hidden rounded-3xl border-1.5 border-line bg-cream-blush">
          {p.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photo} alt={p.name} referrerPolicy="no-referrer" className="size-full object-cover" />
          ) : <User className="size-10 text-plum-faint" />}
        </span>
        <div className="min-w-0">
          <div className="eyebrow">{p.description ?? p.known ?? "Cast & crew"}</div>
          <h1 className="mt-1 text-[clamp(28px,4vw,42px)] font-extrabold leading-tight tracking-[-1.2px]">{p.name}</h1>
          {p.bio && <p className="mt-3 max-w-[68ch] text-[14px] leading-relaxed text-plum-body">{p.bio}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {p.wikipedia && <a href={p.wikipedia} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full border-1.5 border-line bg-paper px-3.5 text-[12.5px] font-extrabold hover:border-frost-hot"><ExternalLink className="size-3.5" />Wikipedia</a>}
            <a href={`https://www.imdb.com/name/${p.id}/`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full border-1.5 border-line bg-paper px-3.5 text-[12.5px] font-extrabold hover:border-frost-hot"><ExternalLink className="size-3.5" />IMDb</a>
          </div>
        </div>
      </div>
      {p.credits.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Credits">
          <h2 className="px-1 text-lg font-extrabold tracking-[-.4px]">Credits · {p.credits.length}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3.5">
            {p.credits.map((c) => (
              <Link key={c.imdb} href={`/movies/t-${c.imdb}`} className="group flex flex-col gap-1.5">
                <Poster src={`https://images.metahub.space/poster/small/${c.imdb}/img`} className="aspect-[2/3] rounded-2xl border-1.5 border-line transition group-hover:-translate-y-1 group-hover:border-frost-hot" />
                <span className="line-clamp-2 text-[13px] font-extrabold leading-tight">{c.title}</span>
                {c.year && <span className="-mt-1 text-[11.5px] font-semibold text-plum-muted">{c.year}</span>}
              </Link>
            ))}
          </div>
        </section>
      ) : <p className="rounded-box border-1.5 border-dashed border-line bg-cream-card p-8 text-center font-semibold text-plum-muted">No credits found for {p.name} yet.</p>}
    </div>
  );
}
