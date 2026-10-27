import { db } from "@/lib/db";
import { isAdmin, requireMember } from "@/lib/auth";
import type { Entry } from "@/lib/store";
import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { PresenceBeacon } from "@/components/shell/presence";
import { CommandPalette } from "@/components/shell/command-palette";
import { GlobalChat } from "@/components/shell/global-chat";
import { StoreSeed } from "@/components/store-seed";
import { SpotlightTracker } from "@/components/spotlight";
import { Toaster } from "@/components/toaster";

// Everything in here is for kuro members only. Not signed in → the portal.
export default async function MembersLayout({ children }: { children: React.ReactNode }) {
  const user = await requireMember();
  const d = await db();
  const [lib, unread] = await d.batch<Record<string, unknown>>([
    d.prepare("select mal_id, status, score, favorite, progress from library where user_id = ?").bind(user.id),
    d.prepare("select count(*) as n from notifications where user_id = ? and read = 0").bind(user.id),
  ]);
  const entries: Record<number, Entry> = {};
  for (const r of lib.results as { mal_id: number; status: Entry["status"]; score: number | null; favorite: number; progress: number }[]) {
    entries[r.mal_id] = { status: r.status, score: r.score, favorite: !!r.favorite, progress: r.progress };
  }

  return (
    <div className="flex min-h-svh flex-col">
      <StoreSeed lib={entries} />
      <SiteHeader
        user={{ handle: user.handle, display_name: user.display_name, avatar_url: user.avatar_url, is_plus: user.is_plus, is_admin: (await isAdmin(user)) ? 1 : 0, accent: user.accent }}
        unread={Number((unread.results[0] as { n: number })?.n ?? 0)}
        shhLabel={user.shh_label}
        hideSlogan={user.hide_slogan === 1}
      />
      <div className="flex-1">{children}</div>
      <SiteFooter />
      <PresenceBeacon />
      <CommandPalette />
      <GlobalChat me={user.handle} />
      <SpotlightTracker />
      <Toaster />
    </div>
  );
}
