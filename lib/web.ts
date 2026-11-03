// Reading the web for /shh: turn a page into plain text, and a search into a short
// result list. Pure parsing here; the fetching lives in the route. Direct fetches are
// the first choice (no middleman to be blocked); r.jina.ai is only a second try.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ""; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ""; } })
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** A page's readable text: scripts, styles and navigation chrome removed, block tags
 *  turned into line breaks, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  let t = html
    .replace(/<(script|style|noscript|svg|template|iframe|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(nav|footer|aside|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*(br|\/p|\/div|\/tr|\/h[1-6]|\/section|\/article|\/table)\s*\/?>/gi, "\n") // (</li> adds none: <li> already starts its own line)
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]*>/g, " ");
  t = decodeEntities(t).replace(/[ \t\f\v ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return (title ? decodeEntities(title).replace(/\s+/g, " ").trim() + "\n\n" : "") + t;
}

export interface SearchHit { title: string; url: string; snippet: string }

/** Results from DuckDuckGo Lite's HTML: title, the real destination (not DDG's
 *  redirect link) and the snippet, in order. */
export function parseDuckLite(html: string, max = 8): SearchHit[] {
  const hits: SearchHit[] = [];
  const anchors = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].filter((m) => /result-link/.test(m[0]));
  const snippets = [...html.matchAll(/<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
  for (let i = 0; i < anchors.length && hits.length < max; i++) {
    const a = anchors[i][0];
    const href = /href=['"]([^'"]+)['"]/i.exec(a)?.[1] ?? "";
    const title = decodeEntities(a.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
    let url = decodeEntities(href);
    const uddg = /[?&]uddg=([^&]+)/.exec(url)?.[1];
    if (uddg) { try { url = decodeURIComponent(uddg); } catch { /* keep the redirect */ } }
    if (url.startsWith("//")) url = "https:" + url;
    if (!title || !/^https?:\/\//i.test(url)) continue;
    const snippet = decodeEntities((snippets[i] ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    hits.push({ title, url, snippet });
  }
  return hits;
}

export function formatHits(hits: SearchHit[]): string {
  return hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}${h.snippet ? "\n   " + h.snippet : ""}`).join("\n\n");
}

/** Only public http(s) URLs may be fetched on a user's or a model's say-so. */
export function isPublicHttpUrl(u: string): boolean {
  let x: URL;
  try { x = new URL(u); } catch { return false; }
  if (x.protocol !== "http:" && x.protocol !== "https:") return false;
  const h = x.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h === "[::1]" || h === "0.0.0.0") return false;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) { const [a, b] = [Number(m[1]), Number(m[2])]; if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false; }
  return true;
}
