import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Poster } from "@/components/poster";
import { cn } from "@/lib/utils";
import { getFranchise, type FranchiseEntry } from "@/lib/franchise";

const LABEL: Record<string, string> = {
  SIDE_STORY: "Side story", SPIN_OFF: "Spin-off", ALTERNATIVE: "Alternative", CHARACTER: "Shared characters",
  SUMMARY: "Recap", COMPILATION: "Compilation", PARENT: "Parent story", OTHER: "Related", CONTAINS: "Contains",
};
const FORMAT: Record<string, string> = { TV: "TV", TV_SHORT: "Short", MOVIE: "Movie", OVA: "OVA", ONA: "ONA", SPECIAL: "Special", MUSIC: "Music" };

function Tile({ e, label }: { e: FranchiseEntry; label: string }) {
  return (
    <Link href={`/anime/${e.malId}`} className="group flex w-[118px] flex-none flex-col gap-1">
      <Poster src={e.cover} className="aspect-[2/3] rounded-2xl border-1.5 border-line transition group-hover:-translate-y-1 group-hover:border-frost-hot" />
      <span className="text-[10.5px] font-bold uppercase tracking-[.1em] text-plum-muted">{label}</span>
      <span className="line-clamp-2 text-[12.5px] font-extrabold leading-tight">{e.title}</span>
    </Link>
  );
}

/** Every season in one place (S1 S2 S3 ...), plus movies, side stories and where the story
 *  continues in the manga. Renders nothing for a show with no relations. */
export async function Franchise({ id, title }: { id: number; title: string }) {
  const f = await getFranchise(id).catch(() => null);
  if (!f) return null;
  const card = "rounded-box border-1.5 border-line bg-cream-card p-5";
  return (
    <section className={cn(card, "flex flex-col gap-5")} aria-label="Seasons and related">
      {f.seasons.length > 1 && (
        <div>
          <div className="eyebrow">Seasons</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {f.seasons.map((s, i) => (
              <Link key={s.malId} href={`/anime/${s.malId}`} title={s.title} aria-current={s.current ? "page" : undefined}
                className={cn("flex min-w-[64px] flex-col rounded-2xl border-1.5 px-3.5 py-2 transition", s.current ? "border-frost-hot bg-frost text-frost-ink" : "border-line hover:border-frost-hot")}>
                <span className="text-[15px] font-extrabold">S{i + 1}</span>
                <span className={cn("text-[11px] font-semibold", s.current ? "text-frost-ink/80" : "text-plum-muted")}>{[s.year, s.episodes ? `${s.episodes} ep` : null].filter(Boolean).join(" · ") || "TBA"}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {f.extras.length > 0 && (
        <div>
          <div className="eyebrow">Movies &amp; specials</div>
          <div className="scrollbar-none mt-2.5 flex gap-3 overflow-x-auto pb-1">
            {f.extras.map((e) => <Tile key={e.malId} e={e} label={[FORMAT[e.format ?? ""] ?? e.format, e.year, e.relation === "PREQUEL" ? "before" : "after"].filter(Boolean).join(" · ")} />)}
          </div>
        </div>
      )}
      {f.related.length > 0 && (
        <div>
          <div className="eyebrow">Side stories &amp; spin-offs</div>
          <div className="scrollbar-none mt-2.5 flex gap-3 overflow-x-auto pb-1">
            {f.related.map((e) => <Tile key={e.malId} e={e} label={LABEL[e.relation] ?? e.relation.toLowerCase().replace(/_/g, " ")} />)}
          </div>
        </div>
      )}
      {f.source && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-cream-blush px-4 py-3">
          <BookOpen className="size-5 flex-none text-frost-deep" />
          <p className="min-w-0 flex-1 text-[13px] font-semibold text-plum-body">
            Based on the {f.source.kind === "novel" ? "light novel" : "manga"} <b>{f.source.title}</b>. An anime can stop well before its source does, so if you finished {title} and want more, pick the story up there.
          </p>
          <Link href={`/manga?q=${encodeURIComponent(f.source.title)}`} className="flex h-9 items-center rounded-full bg-frost px-4 text-[13px] font-extrabold text-frost-ink">Find it to read</Link>
        </div>
      )}
    </section>
  );
}
