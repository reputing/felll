import { requireMember } from "@/lib/auth";
import { all } from "@/lib/db";
import { PageHead } from "@/components/page-head";
import { ProfileEditor } from "@/components/settings/editor";
import { PlaybackSettings } from "@/components/settings/playback";

export const metadata = { title: "Customize" };

export default async function Settings() {
  const me = await requireMember("/settings");
  const library = await all<{ mal_id: number; title: string; image: string | null }>(
    "select mal_id, title, image from library where user_id = ? order by favorite desc, score desc, updated_at desc limit 120",
    me.id,
  );
  let showcase: number[] = [];
  try { showcase = JSON.parse(me.showcase); } catch {}
  return (
    <div className="mx-auto flex max-w-[1300px] flex-col gap-6 px-3 pb-12 pt-4 sm:px-5">
      <PageHead eyebrow={`@${me.handle}`} title="Make it yours" sub="Your page, your colours, your top four." />
      <ProfileEditor
        library={library}
        init={{
          handle: me.handle, display_name: me.display_name, avatar_url: me.avatar_url, banner_url: me.banner_url, bio: me.bio, pronouns: me.pronouns,
          accent: me.accent, theme: me.theme, status_text: me.status_text, showcase, private_lists: !!me.private_lists, hide_reading: !!me.hide_reading, is_plus: !!me.is_plus,
        }}
      />
      <PlaybackSettings />
    </div>
  );
}
