// Provider evaluation probe — runs in CI (runners have internet; the sandbox and
// the Worker cannot reach these hosts). Tells us, with evidence, which of the
// candidate providers are actually live AND return usable data, so we only wire
// up ones that work.
//
//   A) mangareader-api.vercel.app — end to end: search -> manga -> chapters ->
//      page image bytes, and whether the content is English. This is the one
//      manga provider that is hosted (no container to deploy) and was 200 live.
//   B) The anime APIs listed in Munna-Scriptz/free-anime-apis — fetched live,
//      then each base is pinged and the consumet-style ones are shape-probed.
//
// Nothing here is wired into the app; it only reports what is safe to wire.

const UA = "cupcake.gg-probe/1.0";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tryJson(url, opts = {}) {
  const r = await fetch(url, { headers: { accept: "application/json", "user-agent": UA }, signal: AbortSignal.timeout(20000), ...opts });
  const ct = r.headers.get("content-type") || "";
  const body = ct.includes("json") ? await r.json().catch(() => null) : await r.text().catch(() => null);
  return { status: r.status, ct, body };
}

// ------------------------------------------------------------------ A) manga
async function probeMangaReader() {
  console.log("=== A) mangareader-api.vercel.app (hosted, no container) ===");
  const BASE = "https://mangareader-api.vercel.app/api/v1";
  // Is ANY endpoint usable? Hit the list endpoints and a few search spellings.
  for (const path of ["/featured", "/trending", "/search/naruto", `/search/${encodeURIComponent("jujutsu-kaisen")}`, "/search?q=naruto", "/search?keyword=naruto"]) {
    const r = await tryJson(`${BASE}${path}`);
    const n = Array.isArray(r.body) ? r.body.length : Array.isArray(r.body?.data) ? r.body.data.length : Array.isArray(r.body?.results) ? r.body.results.length : "?";
    console.log(`  GET ${path} -> ${r.status} (${r.ct})  items=${n}` + (r.status >= 500 ? `  [${String(r.body).slice(0, 40)}]` : ""));
    await sleep(400);
  }
  const title = "naruto";
  try {
    const s = await tryJson(`${BASE}/search/${encodeURIComponent(title)}`);
    console.log(`  search "${title}" -> ${s.status} (${s.ct})`);
    const list = s.body?.data || s.body?.results || s.body?.mangas || (Array.isArray(s.body) ? s.body : null);
    if (!Array.isArray(list) || !list.length) {
      console.log("  search shape unknown; raw keys:", s.body && typeof s.body === "object" ? Object.keys(s.body) : typeof s.body);
      console.log("  sample:", JSON.stringify(s.body).slice(0, 400));
      return;
    }
    const first = list[0];
    console.log("  first result keys:", Object.keys(first));
    const slug = first.id || first.slug || first.mangaId || first.url?.split("/").filter(Boolean).pop();
    console.log(`  -> slug: ${slug}  title: ${first.title || first.name}`);
    if (!slug) return;

    await sleep(300);
    const m = await tryJson(`${BASE}/manga/${encodeURIComponent(slug)}`);
    console.log(`  manga/${slug} -> ${m.status}`);
    const md = m.body?.data || m.body;
    const chapters = md?.chapters || md?.chapterList || md?.chapter || [];
    console.log(`  detail keys: ${md && typeof md === "object" ? Object.keys(md).join(",") : typeof md}`);
    console.log(`  chapters: ${Array.isArray(chapters) ? chapters.length : "n/a"}`);
    if (Array.isArray(chapters) && chapters.length) {
      const c = chapters[chapters.length - 1]; // oldest = ch 1 usually
      console.log("  chapter keys:", Object.keys(c), "| sample:", JSON.stringify(c).slice(0, 200));
      const cid = c.id || c.slug || c.chapterId || c.url?.split("/").filter(Boolean).pop();
      // try common page endpoints
      for (const path of [`/chapter/${encodeURIComponent(cid)}`, `/manga/${encodeURIComponent(slug)}/${encodeURIComponent(cid)}`, `/read/${encodeURIComponent(cid)}`]) {
        await sleep(300);
        const pg = await tryJson(`${BASE}${path}`);
        if (pg.status === 200) {
          const pages = pg.body?.data?.images || pg.body?.images || pg.body?.pages || pg.body?.data || pg.body;
          const imgs = Array.isArray(pages) ? pages : pages?.images || [];
          console.log(`  pages via ${path} -> ${pg.status}, images: ${Array.isArray(imgs) ? imgs.length : "?"}`);
          if (Array.isArray(imgs) && imgs.length) {
            const u = typeof imgs[0] === "string" ? imgs[0] : imgs[0]?.url || imgs[0]?.src || imgs[0]?.img;
            console.log(`  first image url: ${u}`);
            if (u) {
              const img = await fetch(u, { headers: { "user-agent": UA, referer: "https://mangareader-api.vercel.app/" }, signal: AbortSignal.timeout(15000) }).catch((e) => ({ err: e.message }));
              if (img.err) console.log(`  image fetch FAILED: ${img.err}`);
              else console.log(`  image -> ${img.status} ${img.headers.get("content-type")} ${img.headers.get("content-length") || "?"}B  ${img.ok ? "✅ REAL IMAGE" : "⚠️"}`);
            }
          }
          break;
        } else {
          console.log(`  pages via ${path} -> ${pg.status}`);
        }
      }
    }
  } catch (e) {
    console.log("  FAILED:", e.message);
  }
}

// ------------------------------------------------------------------ B) anime
async function probeAnime() {
  console.log("\n=== B) free-anime-apis (Munna-Scriptz) — which are live? ===");
  let readme = "";
  for (const raw of [
    "https://raw.githubusercontent.com/Munna-Scriptz/free-anime-apis/main/README.md",
    "https://raw.githubusercontent.com/Munna-Scriptz/free-anime-apis/master/README.md",
  ]) {
    const r = await tryJson(raw);
    if (r.status === 200 && typeof r.body === "string") { readme = r.body; break; }
  }
  if (!readme) { console.log("  could not fetch the list README"); }

  // Extract candidate API base URLs from the README (http(s) links), dedupe hosts.
  const urls = [...new Set((readme.match(/https?:\/\/[^\s)\]"'<>]+/g) || []))]
    .filter((u) => !/github\.com|githubusercontent|shields\.io|img|\.png|\.jpg|\.gif|discord|t\.me|telegram/i.test(u));
  const hosts = [...new Set(urls.map((u) => { try { return new URL(u).origin; } catch { return null; } }).filter(Boolean))];
  console.log(`  extracted ${hosts.length} candidate hosts from the list`);

  // consumet-style shape probes: an anime API usually answers one of these.
  const shapeProbes = ["/anime/gogoanime/naruto", "/meta/anilist/naruto", "/anime/zoro/naruto", "/anime/9anime/naruto", "/"];
  for (const host of hosts.slice(0, 25)) {
    let line = `  ${host} -> `;
    try {
      const ping = await fetch(host, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) }).catch((e) => ({ err: e.message }));
      if (ping.err) { console.log(line + `DEAD (${ping.err})`); continue; }
      line += `${ping.status}`;
      // try a consumet search on it
      let hit = "";
      for (const sp of shapeProbes) {
        const r = await tryJson(host + sp).catch(() => null);
        if (r && r.status === 200 && r.body && typeof r.body === "object") {
          const keys = Object.keys(r.body);
          if (keys.some((k) => /results|episodes|sources|data|title/i.test(k))) { hit = `${sp} [${keys.slice(0, 5).join(",")}]`; break; }
        }
        await sleep(120);
      }
      console.log(line + (hit ? `  ✅ consumet-shape: ${hit}` : "  (alive, no consumet shape found)"));
    } catch (e) {
      console.log(line + `err ${e.message}`);
    }
    await sleep(150);
  }
}

await probeMangaReader();
await probeAnime();
console.log("\nDone.");
