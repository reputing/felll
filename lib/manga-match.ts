// Shared title matching for the second manga sources (weeb / comick / consumet).
// A MangaDex title can be English, romaji, or native, and each aggregator
// indexes by a different one, so we search by EVERY known name for a title and
// accept a result whose title matches ANY of them.
//
// Two quirks of weebcentral's search drive the rest of this file:
//  - it breaks on punctuation — "Omniscient Reader's Viewpoint", "Don't Toy With
//    Me, Miss Nagatoro!" and "Komi Can't Communicate" all return nothing, while
//    "Omniscient Reader", "Nagatoro" and "Komi" return the series.
//  - it prefix-matches its own indexed title, which is sometimes a SHORTER
//    canonical form than MangaDex's ("Omniscient Reader" vs "...'s Viewpoint").
// So we search punctuation-free word-prefixes of each name, and match a result
// against the names AND their short prefixes.

// Split a title into words on whitespace and the punctuation search engines
// choke on (apostrophes, commas, hyphens, etc.); "×" is folded to "x" first.
const SPLIT = /[\s,.!?:;'’"“”()[\]{}/\\_~·・|–—-]+/;
const words = (s: string): string[] => (s || "").replace(/[×✕╳]/g, "x").split(SPLIT).filter(Boolean);

// Compact, punctuation-insensitive form for comparing titles across sources:
// lowercase, "×" → "x" (MangaDex's "SPY×FAMILY" vs weebcentral's "Spy x
// Family"), then drop everything but letters and digits.
const squash = (s: string): string => (s || "").toLowerCase().replace(/[×✕╳]/g, "x").replace(/[^a-z0-9]+/g, "");

// The names a result may match: the full names plus their 2- and 3-word prefixes,
// so a source whose canonical title is a shorter form ("Omniscient Reader") still
// matches our longer MangaDex name ("Omniscient Reader's Viewpoint").
function matchSet(names: string[]): string[] {
  const out = [...names];
  for (const n of names) {
    const w = words(n);
    for (const k of [2, 3]) if (w.length > k) out.push(w.slice(0, k).join(" "));
  }
  return out;
}

/** Pick the candidate whose raw title matches any of `names` (or their short
 *  prefixes): an exact compact match, or one being a prefix of the other within a
 *  few characters. Tight on purpose — a loose substring match pulls the wrong
 *  series. Exact matches are preferred over prefix ones, across all candidates. */
export function pickMatch<T extends { raw: string }>(cands: T[], names: string[]): T | undefined {
  const w = [...new Set(matchSet(names).map(squash).filter((s) => s.length >= 2))];
  if (!w.length) return undefined;
  const near = (r: string) => w.some((n) => (r.startsWith(n) && r.length - n.length <= 4) || (n.startsWith(r) && n.length - r.length <= 4));
  const sq = cands.map((c) => ({ c, r: squash(c.raw) })).filter((x) => x.r);
  return (sq.find((x) => w.includes(x.r)) || sq.find((x) => near(x.r)))?.c;
}

/** Queries to SEARCH a source with. Beyond each full name: a "×" → " x " variant,
 *  and 1/2/3-word punctuation-free prefixes (weebcentral prefix-matches its title
 *  and breaks on apostrophes/commas, so "Komi" and "Omniscient Reader" hit titles
 *  the full strings miss). Precision stays safe — pickMatch re-checks each result
 *  against the real names. */
export function searchQueries(names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    out.push(n);
    if (/[×✕╳]/.test(n)) out.push(n.replace(/[×✕╳]/g, " x "));
    const w = words(n);
    // 1- and 2-word prefixes cover the finicky cases (Komi, Nagatoro, Omniscient
    // Reader); 3-word was rarely the deciding query and just doubled container
    // load, so it's dropped. Capped so one title can't fan out into many hits.
    for (const k of [1, 2]) if (w.length > k) out.push(w.slice(0, k).join(" "));
  }
  return [...new Set(out.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 8);
}
