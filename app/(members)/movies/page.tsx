import { requireMember } from "@/lib/auth";
import { MoviesComingSoonPage } from "@/components/movies/coming-soon";

export const metadata = { title: "Movies & Series" };

// The upstream movie providers are down, so the section shows a blurred
// "coming soon" state instead of the live browser. To bring it back, restore
// the `moviesEnabled()` + <MovieBrowse /> version from git history.
export default async function MoviesPage() {
  await requireMember("/movies");
  return <MoviesComingSoonPage />;
}
