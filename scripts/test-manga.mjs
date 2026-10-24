// End-to-end check of the manga pipeline against real MangaDex, mirroring
// lib/manga.ts: popular -> chapters (English first, fallback) -> at-home pages
// -> actually fetch the first page images. Run from somewhere with internet
// (GitHub Actions; a Cloudflare Worker / this sandbox can't reach MangaDex).
const API = "https://api.mangadex.org";
const RATING = "contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica";
const UA = "cupcake.gg-test/1.0 (+https://cupcake.gg)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function j(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { accept: "application/json", "user-agent": UA } });
    if (r.ok) return r.json();
    if (r.status === 429) { await sleep(2000 * (i + 1)); continue; }
    throw new Error(`${r.status} ${url.replace(API, "")}`);
  }
  throw new Error(`429 after retries ${url.replace(API, "")}`);
}

async function popular(limit) {
  const d = await j(`${API}/manga?limit=${limit}&offset=0&${RATING}&order[followedCount]=desc&hasAvailableChapters=true`);
  return d.data.map((m) => ({ id: m.id, title: m.attributes.title.en || Object.values(m.attributes.title)[0] || "?" }));
}

async function feed(id, extraQs) {
  const out = [];
  for (let off = 0; off < 2000; off += 500) {
    const d = await j(`${API}/manga/${id}/feed?limit=500&offset=${off}&order[volume]=asc&order[chapter]=asc&includes[]=scanlation_group&${RATING}${extraQs}`);
    out.push(...(d.data || []));
    if (!d.data?.length || off + 500 >= (d.total || 0)) break;
    await sleep(250);
  }
  return out;
}

function build(raw, external = false) {
  const seen = new Set(); const out = [];
  for (const c of raw) {
    const a = c.attributes; const ext = !!a.externalUrl;
    if (external ? !ext : ext || !a.pages) continue;
    const key = String(a.chapter ?? "") || c.id;
    if (seen.has(key)) continue; seen.add(key);
    out.push({ id: c.id, chapter: String(a.chapter ?? ""), pages: a.pages, lang: a.translatedLanguage, external: ext });
  }
  return out;
}

async function chapters(id, lang) {
  if (lang) { const c = build(await feed(id, `&translatedLanguage[]=${lang}`)); if (c.length) return c; }
  const en = build(await feed(id, "&translatedLanguage[]=en")); if (en.length) return en;
  const all = await feed(id, "");
  const byLang = new Map();
  for (const c of all) { if (c.attributes.externalUrl || !c.attributes.pages) continue; const l = c.attributes.translatedLanguage; const a = byLang.get(l) || []; a.push(c); byLang.set(l, a); }
  let best = []; for (const a of byLang.values()) if (a.length > best.length) best = a;
  const b = build(best); if (b.length) return b;
  return build(all, true);
}

async function pages(chapterId) {
  const d = await j(`${API}/at-home/server/${chapterId}`);
  return (d.chapter.data || []).map((f) => `${d.baseUrl}/data/${d.chapter.hash}/${f}`);
}

async function imgOk(url, referer) {
  const headers = { "user-agent": "Mozilla/5.0" };
  if (referer) headers.referer = referer;
  try {
    const r = await fetch(url, { headers });
    const ct = r.headers.get("content-type") || "";
    const bytes = (await r.arrayBuffer()).byteLength;
    return { ok: r.ok && ct.startsWith("image/") && bytes > 500, status: r.status, ct, bytes };
  } catch (e) { return { ok: false, status: 0, ct: String(e.message), bytes: 0 }; }
}

const pool = await popular(40);
const picks = pool.sort(() => Math.random() - 0.5).slice(0, 5);
let good = 0;
console.log(`Testing 5 random manga of ${pool.length} popular titles\n`);
for (const m of picks) {
  try {
    const chs = await chapters(m.id, "en");
    if (!chs.length) { console.log(`❌ ${m.title}: NO chapters`); continue; }
    const ch = chs.find((c) => !c.external) || chs[0];
    if (ch.external) { console.log(`➖ ${m.title}: only official/external chapters (${chs.length})`); continue; }
    const pg = await pages(ch.id);
    if (!pg.length) { console.log(`❌ ${m.title}: ch ${ch.chapter} has NO page files`); continue; }
    const noRef = await imgOk(pg[0], null);
    const withRef = await imgOk(pg[0], "https://cupcake.gg/");
    if (noRef.ok) good++;
    console.log(`${noRef.ok ? "✅" : "❌"} ${m.title}  [${ch.lang}] ch${ch.chapter} — ${chs.length} chapters, ${pg.length} pages`);
    console.log(`     page image: no-referrer=${noRef.ok} (${noRef.status} ${noRef.ct} ${noRef.bytes}b) | with-referer=${withRef.ok} (${withRef.status})`);
  } catch (e) {
    console.log(`❌ ${m.title}: ${e.message}`);
  }
  await sleep(1200);
}
console.log(`\n${good}/5 manga load pages successfully.`);
process.exit(good >= 4 ? 0 : 1);
