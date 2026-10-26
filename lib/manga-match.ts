// Shared title matching for the second manga sources (weeb / comick / consumet).
// A MangaDex title can be English, romaji, or native, and each aggregator
// indexes by a different one — weebcentral finds "Sono Bisque Doll wa Koi o
// Suru" but not "My Dress-Up Darling"; comick is the reverse for other titles.
// So we search by EVERY known name for a title and accept a result whose title
// matches ANY of them, instead of betting on one name being the right one.

// Compact, punctuation-insensitive form for comparing titles across sources:
// lowercase, "×" → "x" (so MangaDex's "SPY×FAMILY" meets weebcentral's "Spy x
// Family"), then drop everything but letters and digits. "My Dress-Up Darling"
// and "my dress up darling" collapse to the same token; unrelated titles stay
// far apart, so we don't grab "...Before Spy x Family" for "Spy x Family".
const squash = (s: string): string => (s || "").toLowerCase().replace(/[×✕╳]/g, "x").replace(/[^a-z0-9]+/g, "");

/** Pick the candidate whose raw title matches any of `names`: an exact compact
 *  match, or one being a prefix of the other within a few characters (a trailing
 *  volume/word). Tight on purpose — a loose substring match pulls the wrong
 *  series. */
export function pickMatch<T extends { raw: string }>(cands: T[], names: string[]): T | undefined {
  const w = [...new Set(names.map(squash).filter((s) => s.length >= 2))];
  if (!w.length) return undefined;
  const ok = (r: string) =>
    !!r && w.some((n) => r === n || (r.startsWith(n) && r.length - n.length <= 4) || (n.startsWith(r) && n.length - r.length <= 4));
  return cands.find((c) => ok(squash(c.raw)));
}

/** Queries to SEARCH a source with, given a title's known names. Beyond the
 *  names themselves: a "×" → " x " variant (aggregators index "SPY×FAMILY" as
 *  "Spy x Family"), and a short 3-word prefix of each long name (their search is
 *  fussy about romanisation — weebcentral has "...Koi WO Suru" where MangaDex
 *  has "...Koi O Suru", so the full string misses but "Sono Bisque Doll" hits).
 *  Precision stays safe — pickMatch checks each result against the full names. */
export function searchQueries(names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    out.push(n);
    if (/[×✕╳]/.test(n)) out.push(n.replace(/[×✕╳]/g, " x "));
    const words = n.split(/\s+/).filter(Boolean);
    if (words.length > 3) out.push(words.slice(0, 3).join(" "));
  }
  return [...new Set(out.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 8);
}
