// Search results for one franchise arrive as separate shows ("Re:Zero", "Re:Zero 2nd Season",
// "Re:Zero 2nd Season Part 2" ...). This folds them into one row with S1 S2 S3 chips, by reading
// the season / part markers out of the titles. Title-based on purpose: it costs no extra lookups,
// so it works for every search; the anime page itself uses AniList's real relations (lib/franchise).

const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, final: 99 };
const ROMAN: Record<string, number> = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };

interface Marker { base: string; season: number | null; part: number | null; kind: string | null }

export function parseMarker(title: string): Marker {
  let t = " " + title.toLowerCase().replace(/[“”"]/g, "") + " ";
  let season: number | null = null, part: number | null = null, kind: string | null = null;
  const take = (re: RegExp, f: (m: RegExpExecArray) => void) => { const m = re.exec(t); if (m) { f(m); t = t.replace(re, " "); } };
  take(/\b(\d+)(?:st|nd|rd|th)\s+season\b/, (m) => { season = Number(m[1]); });
  take(/\b(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|final)\s+season\b/, (m) => { season = ORD[m[1]]; });
  take(/\bseason\s*(\d+)\b/, (m) => { season ??= Number(m[1]); });
  take(/\b(?:part|cour)\s*(\d+)\b/, (m) => { part = Number(m[1]); });
  take(/\b(ova|oad|ona|special|specials|movie|film|recap)\b/, (m) => { kind = m[1] === "oad" ? "ova" : m[1] === "film" ? "movie" : m[1]; });
  take(/\s(ii|iii|iv|v|vi)\s*$/, (m) => { season ??= ROMAN[m[1]]; });
  take(/\s([2-9])\s*$/, (m) => { season ??= Number(m[1]); });
  const base = t.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return { base, season, part, kind };
}

export interface SeasonLink { id: number; label: string; title: string }
export interface GroupedHit<T> { lead: T; seasons: SeasonLink[] }

/** Group search results (already in relevance order) by franchise. Only groups with 2+ entries
 *  gain chips; the lead is the earliest (S1 when it is there), the position of a group is that of
 *  its best-ranked member. */
export function groupSeasons<T extends { id: number; title: string; year?: number | null }>(items: T[]): GroupedHit<T>[] {
  const groups = new Map<string, { items: { it: T; m: Marker }[] }>();
  const order: string[] = [];
  for (const it of items) {
    const m = parseMarker(it.title);
    const key = m.base.length >= 3 ? m.base : `#${it.id}`;
    if (!groups.has(key)) { groups.set(key, { items: [] }); order.push(key); }
    groups.get(key)!.items.push({ it, m });
  }
  return order.map((k) => {
    const g = groups.get(k)!.items;
    const rank = (x: { it: T; m: Marker }) => (x.m.kind ? 1000 : 0) + (x.m.season ?? 1) * 10 + (x.m.part ?? 1);
    const sorted = [...g].sort((a, b) => rank(a) - rank(b) || (a.it.year ?? 0) - (b.it.year ?? 0));
    const seasons: SeasonLink[] = sorted.length < 2 ? [] : sorted.map(({ it, m }) => {
      const label = m.kind ? m.kind.toUpperCase() === "OVA" || m.kind === "ona" ? m.kind.toUpperCase() : m.kind[0].toUpperCase() + m.kind.slice(1)
        : `${m.season === 99 ? "Final" : `S${m.season ?? 1}`}${m.part ? ` P${m.part}` : ""}`;
      return { id: it.id, label, title: it.title };
    });
    return { lead: sorted[0].it, seasons };
  });
}
