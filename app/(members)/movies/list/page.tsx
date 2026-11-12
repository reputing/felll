import Link from "next/link";
import { Clock3 } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { movieList } from "@/lib/movie-user";
import { PageHead } from "@/components/page-head";
import { Button } from "@/components/ui/button";
import { MovieList } from "@/components/movies/list";

export const metadata = { title: "My list · Movies & Series" };

export default async function MyMovieList() {
  const me = await requireMember("/movies/list");
  const rows = await movieList(me.id);
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow={`@${me.handle} / films & series`} title="My list" sub="Everything you’re watching, planning, finished and loved.">
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link href="/movies/history"><Clock3 className="size-4" />History</Link></Button>
          <Button asChild><Link href="/movies">Browse</Link></Button>
        </div>
      </PageHead>
      <MovieList rows={rows} initialTab={rows.some((r) => r.status === "watching") ? "watching" : "all"} />
    </div>
  );
}
