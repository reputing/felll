// Provider probe, run from CI (runners have internet; the sandbox/Worker can't
// reach these). Answers three things:
//   1. Does the English-first resolution pick English for popular titles?
//   2. Does MangaDex even HAVE English for JJK etc. (if not, no code fix helps)?
//   3. Is the hosted mangareader-api a viable English fallback source?
const MD = "https://api.mangadex.org";
const RATING = "contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica";
const UA = "cupcake.gg-probe/1.0";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function j(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { accept: "application/json", "user-agent": UA } });
    if (r.ok) return r.json();
    if (r.status === 429) { await sleep(1500 * (i + 1)); continue; }
    throw new Error(`${r.status}`);
  }
  throw new Error("429");
}
async function feed(id, qs) {
  const out = [];
  for (let o = 0; o < 2000; o += 500) {
    const d = await j(`${MD}/manga/${id}/feed?limit=500&offset=${o}&order[chapter]=asc&${RATING}${qs}`);
    out.push(...(d.data || []));
    if (!d.data?.length || o + 500 >= (d.total || 0)) break;
    await sleep(200);
  }
  return out;
}
const hosted = (raw, lang) => raw.filter((c) => c.attributes.translatedLanguage === lang && !c.attributes.externalUrl && c.attributes.pages > 0);
const external = (raw, lang) => raw.filter((c) => c.attributes.translatedLanguage === lang && c.attributes.externalUrl);

// the NEW English-first resolution, mirrored
function resolve(all) {
  const enH = hosted(all, "en"); if (enH.length) return { lang: "en", kind: "hosted", n: enH.length };
  const enX = external(all, "en"); if (enX.length) return { lang: "en", kind: "external", n: enX.length };
  const byLang = new Map();
  for (const c of all) { if (c.attributes.externalUrl || !c.attributes.pages) continue; const l = c.attributes.translatedLanguage; const a = byLang.get(l) || []; a.push(c); byLang.set(l, a); }
  let best = [], bl = ""; for (const [l, a] of byLang) if (a.length > best.length) { best = a; bl = l; }
  if (best.length) return { lang: bl, kind: "hosted", n: best.length };
  return { lang: "?", kind: "external-any", n: all.filter((c) => c.attributes.externalUrl).length };
}
async function mdId(title) {
  const d = await j(`${MD}/manga?title=${encodeURIComponent(title)}&limit=1&order[relevance]=desc`);
  return d.data[0] && { id: d.data[0].id, title: d.data[0].attributes.title.en || title, langs: d.data[0].attributes.availableTranslatedLanguages || [] };
}

console.log("=== 1) English-first resolution on popular titles (MangaDex) ===");
for (const t of ["Jujutsu Kaisen", "One Piece", "Chainsaw Man", "Solo Leveling", "Berserk", "Oshi no Ko"]) {
  try {
    const m = await mdId(t);
    if (!m) { console.log(`  ${t}: not found`); continue; }
    const all = await feed(m.id, "");
    const r = resolve(all);
    const enH = hosted(all, "en").length, enX = external(all, "en").length;
    const flag = r.lang === "en" ? "✅ EN" : `⚠️ ${r.lang.toUpperCase()}`;
    console.log(`  ${flag}  ${m.title}  -> ${r.kind} (${r.n})   [MD has: en-hosted=${enH}, en-external=${enX}, langs=${m.langs.includes("en") ? "en✓" : "no-en"}]`);
    await sleep(900);
  } catch (e) { console.log(`  ${t}: error ${e.message}`); }
}

console.log("\n=== 2) mangareader-api.vercel.app probe (candidate English fallback) ===");
const BASE = "https://mangareader-api.vercel.app";
try {
  const t0 = Date.now();
  const oapi = await fetch(`${BASE}/openapi.json`, { headers: { "user-agent": UA } });
  console.log(`  GET /openapi.json -> ${oapi.status} (${Date.now() - t0}ms)`);
  if (oapi.ok) {
    const spec = await oapi.json();
    const paths = Object.keys(spec.paths || {});
    console.log(`  endpoints (${paths.length}):`);
    for (const p of paths.slice(0, 30)) console.log(`     ${Object.keys(spec.paths[p]).join(",").toUpperCase()}  ${p}`);
  }
} catch (e) { console.log(`  unreachable: ${e.message}`); }

console.log("\nDone.");
