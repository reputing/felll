import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";

type Props = { params: Promise<{ slug: string }> };

export const metadata = { title: "Movies & Series" };

// Movie streaming is down — the section is in its "coming soon" state (see
// app/(members)/movies/page.tsx), so deep links to a title send the member back
// to /movies instead of a broken player. Restore the full watch page from git
// history once a working provider is wired up.
export default async function MovieWatchPage({ params }: Props) {
  const { slug } = await params;
  await requireMember(`/movies/${slug}`);
  redirect("/movies");
}
