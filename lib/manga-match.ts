// Shared title matching for the second manga sources (weeb / comick / consumet).
// A MangaDex title can be English, romaji, or native, and each aggregator
// indexes by a different one — weebcentral finds "Sono Bisque Doll wa Koi o
// Suru" but not "My Dress-Up Darling"; comick is the reverse for other titles.
// So we search by EVERY known name for a title and accept a result whose title
// matches ANY of them, instead of betting on one name being the right one.

export const normName = (s: string): string => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Queries to SEARCH a source with, given a title's known names. Beyond the
 *  names themselves, add a short distinctive prefix (first 3 words) of each long
 *  name: aggregator search engines are fussy about romanisation (weebcentral
 *  indexed "Sono Bisque Doll wa Koi WO Suru" but MangaDex has "...Koi O Suru",
 *  so the full string misses while "Sono Bisque Doll" hits). Precision is still
 *  safe — pickMatch checks each result's title against the full names. */
export function searchQueries(names: string[]): string[] {
  const out = [...names];
  for (const n of names) {
    const words = n.split(/\s+/).filter(Boolean);
    if (words.length > 3) out.push(words.slice(0, 3).join(" "));
  }
  return [...new Set(out.filter((s) => s && s.trim()))].slice(0, 8);
}

/** Pick the best candidate whose (already-normalised) `.t` title matches any of
 *  `names`: exact first, then prefix either way, then a close-length substring. */
export function pickMatch<T extends { t: string }>(cands: T[], names: string[]): T | undefined {
  const w = [...new Set(names.map(normName).filter(Boolean))];
  if (!w.length) return undefined;
  const near = (t: string) => w.some((n) => (t.includes(n) || n.includes(t)) && Math.abs(t.length - n.length) <= 6);
  return (
    cands.find((c) => w.includes(c.t)) ||
    cands.find((c) => w.some((n) => c.t.startsWith(n) || n.startsWith(c.t))) ||
    cands.find((c) => near(c.t))
  );
}
