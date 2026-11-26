"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { User } from "lucide-react";

// A title's cast as faces. The names come with the page; the photos are fetched after it has painted (and cached for good
// on the server), so a slow lookup never holds the watch page up. Each one opens that person's page.
export function Cast({ names, directors = [] }: { names: string[]; directors?: string[] }) {
  const [people, setPeople] = useState<{ name: string; photo: string | null; known: string | null }[] | null>(null);
  const all = [...directors.filter((d) => !names.includes(d)), ...names].slice(0, 16);
  const key = all.join("|");
  useEffect(() => {
    if (!key) return;
    let on = true;
    fetch(`/api/movie/people?names=${encodeURIComponent(key)}`).then((r) => (r.ok ? r.json() : null)).then((d) => on && setPeople(d?.people ?? [])).catch(() => on && setPeople([]));
    return () => { on = false; };
  }, [key]);
  if (!all.length) return null;
  const photo = (n: string) => people?.find((p) => p.name === n)?.photo ?? null;
  return (
    <section className="rounded-box border-1.5 border-line bg-cream-card p-5" aria-label="Cast">
      <div className="eyebrow">Cast &amp; crew</div>
      <ul className="scrollbar-none mt-3 flex gap-3.5 overflow-x-auto pb-1">
        {all.map((n) => {
          const src = photo(n);
          const role = directors.includes(n) ? "Director" : "";
          return (
            <li key={n} className="w-[92px] flex-none">
              <Link href={`/movies/person/${encodeURIComponent(n)}`} className="group flex flex-col items-center gap-1.5 text-center">
                <span className="relative grid size-[84px] place-items-center overflow-hidden rounded-full border-1.5 border-line bg-cream-blush transition group-hover:border-frost-hot">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                  ) : people === null ? <span className="skeleton size-full" /> : <User className="size-6 text-plum-faint" />}
                </span>
                <span className="line-clamp-2 text-[12.5px] font-extrabold leading-tight group-hover:text-frost-text">{n}</span>
                {role && <span className="-mt-1 text-[10.5px] font-bold uppercase tracking-[.08em] text-plum-muted">{role}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
