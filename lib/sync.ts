// Keeping AniList in step with what happens here. Best effort and never blocks a request: if the
// member linked an AniList token, a status/progress/score change is written to their list in the
// background, and a failure is noted on the link instead of surfacing on the page.
import { background, first, run } from "./db";
import { malToAnilist } from "./anivexa";
import { pushAnime } from "./anilist";
import type { ListStatus } from "./utils";

export function pushToAnilist(userId: string, malId: number, p: { status?: ListStatus | null; progress?: number; score?: number | null; rewatching?: boolean }) {
  return background((async () => {
    const link = await first<{ token: string | null }>("select token from sync_links where user_id = ? and provider = 'anilist'", userId).catch(() => null);
    if (!link?.token) return;
    try {
      const id = await malToAnilist(malId);
      if (!id) return;
      await pushAnime(link.token, id, p);
      await run("update sync_links set last_push = unixepoch(), note = null where user_id = ?", userId);
    } catch (e) {
      await run("update sync_links set note = ? where user_id = ?", `couldn't update AniList: ${(e as Error).message}`.slice(0, 200), userId).catch(() => {});
    }
  })());
}
