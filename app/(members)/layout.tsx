import { db } from "@/lib/db";
import { isAdmin, requireMember } from "@/lib/auth";
import type { Entry } from "@/lib/store";
import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { PresenceBeacon } from "@/components/shell/presence";
import { CommandPalette } from "@/components/shell/command-palette";
import { GlobalChat } from "@/components/shell/global-chat";
import { MusicPlayer } from "@/components/music/music-player";
import { StoreSeed } from "@/components/store-seed";
import { SpotlightTracker } from "@/components/spotlight";
import { Toaster } from "@/components/toaster";
import { MobileDock } from "@/components/shell/mobile-dock";

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
      <div aria-hidden className="aurora"><i /><i /><i /></div>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-frost focus:px-4 focus:py-2 focus:text-[13px] focus:font-extrabold focus:text-frost-ink">Skip to content</a>
      <StoreSeed lib={entries} />
      <SiteHeader
        user={{ handle: user.handle, display_name: user.display_name, avatar_url: user.avatar_url, is_plus: user.is_plus, is_admin: (await isAdmin(user)) ? 1 : 0, accent: user.accent }}
        unread={Number((unread.results[0] as { n: number })?.n ?? 0)}
        hideSlogan={user.hide_slogan === 1}
      />
      <main id="main" tabIndex={-1} className="flex-1 pb-[calc(var(--dock-h)+env(safe-area-inset-bottom))] outline-none">{children}</main>
      <SiteFooter />
      <PresenceBeacon />
      <CommandPalette />
      <GlobalChat me={user.handle} />
      <MusicPlayer />
      <SpotlightTracker />
      <MobileDock />
      <Toaster />
    </div>
  );
}
