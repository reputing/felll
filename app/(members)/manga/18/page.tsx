import { requireMember } from "@/lib/auth";
import { PageHead } from "@/components/page-head";
import { AgeGate } from "@/components/sources/age-gate";
import { MangaBrowse } from "@/components/manga/browse";

export const metadata = { title: "18+ manga" };

// The 18+ (pornographic) MangaDex catalogue — hentai and adult manhwa, read
// in-app. Kept off the main /manga page and behind the adult gate (users.adult_ok,
// the same gate the doujin section uses), so it's opt-in, not invasive.
export default async function Manga18Page() {
  const user = await requireMember("/manga/18");
  const content = (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow="Cupcake / 18+" title="18+ manga" sub="Explicit manga and manhwa, read right here. 18+ only." />
      <MangaBrowse adult />
    </div>
  );
  return <AgeGate approved={user.adult_ok === 1}>{content}</AgeGate>;
}
