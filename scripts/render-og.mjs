// Renders public/og-v3.png: the cupcake.gg link-preview card with a shelf of
// real anime covers from the catalog's source (Jikan top anime). Run where the
// anime CDNs are reachable (e.g. GitHub Actions, not a Cloudflare Worker and not
// the dev sandbox). See .github/workflows/og-card.yml.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const WIDTH = 1200, HEIGHT = 630;

async function topCovers(n) {
  try {
    const res = await fetch("https://api.jikan.moe/v4/top/anime?filter=bypopularity&limit=12", { headers: { accept: "application/json" } });
    if (!res.ok) return [];
    const { data } = await res.json();
    return (data ?? [])
      .map((a) => a?.images?.jpg?.large_image_url || a?.images?.jpg?.image_url)
      .filter(Boolean)
      .slice(0, n);
  } catch {
    return [];
  }
}

const covers = await topCovers(5);
const icon = "data:image/png;base64," + readFileSync("public/cupcake.png").toString("base64");

// Real covers when we have them; otherwise tasteful gradient spines so the card
// is never empty.
const shelf = covers.length
  ? covers.map((u, i) => `<div class="poster" style="margin-top:${i * 44}px"><img src="${u}" crossorigin="anonymous" alt=""></div>`).join("")
  : [0, 1, 2, 3].map((i) => `<div class="poster ph" style="margin-top:${i * 44}px"></div>`).join("");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:#09080a;--pink:#ff8fc4;--pink-text:#ffb3da;--ink:#f7eef3;--muted:#a88d9b}
  html,body{width:${WIDTH}px;height:${HEIGHT}px}
  body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:var(--bg);color:var(--ink);overflow:hidden;position:relative;-webkit-font-smoothing:antialiased}
  .glow{position:absolute;width:980px;height:980px;right:-300px;top:-440px;border-radius:50%;background:radial-gradient(circle,rgba(255,143,196,.26),rgba(255,143,196,0) 62%)}
  .shelf{position:absolute;right:-26px;top:58px;display:flex;gap:22px;transform:rotate(9deg)}
  .poster{width:168px;height:252px;border-radius:20px;overflow:hidden;border:1px solid #2f2530;box-shadow:0 36px 70px -34px rgba(0,0,0,.9)}
  .poster img{width:100%;height:100%;object-fit:cover;display:block}
  .poster.ph{background:linear-gradient(160deg,#3a2230,#17101a)}
  .fade{position:absolute;inset:0;background:linear-gradient(90deg,#09080a 40%,rgba(9,8,10,.55) 66%,rgba(9,8,10,0) 90%)}
  .wrap{position:relative;padding:74px;height:100%;display:flex;flex-direction:column}
  .top{display:flex;align-items:center;gap:20px}
  .mark{width:78px;height:78px;filter:drop-shadow(0 8px 18px rgba(255,143,196,.4))}
  .word{font-weight:800;font-size:42px;letter-spacing:-1.6px}
  .word b{background:linear-gradient(90deg,#ff8fc4,#ffb3da);-webkit-background-clip:text;background-clip:text;color:transparent}
  .tag{margin-left:auto;font-size:14px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:var(--pink-text);border:1.5px solid #4a2a3d;border-radius:999px;padding:10px 19px;background:rgba(255,143,196,.06)}
  .mid{margin-top:auto}
  h1{font-size:78px;line-height:.99;letter-spacing:-3.2px;font-weight:800;max-width:700px}
  h1 span{color:#ffa6d2}
  .sub{margin-top:22px;font-size:23px;font-weight:500;color:var(--muted);max-width:620px;line-height:1.4}
  .chips{margin-top:32px;display:flex;flex-wrap:wrap;gap:12px;max-width:720px}
  .chip{font-size:19px;font-weight:800;padding:10px 20px;border-radius:999px;color:var(--pink-text);background:rgba(255,143,196,.10);border:1.5px solid rgba(255,143,196,.34)}
</style></head><body>
  <div class="glow"></div>
  <div class="shelf">${shelf}</div>
  <div class="fade"></div>
  <div class="wrap">
    <div class="top"><img class="mark" src="${icon}" alt=""><div class="word">cupcake<b>.gg</b></div><div class="tag">members only</div></div>
    <div class="mid">
      <h1>your anime, manga<br>&amp; movies, <span>one box.</span></h1>
      <div class="sub">the kuro members' watch box. lists, ratings, threaded comments, next-episode countdowns, and every title on MyAnimeList.</div>
      <div class="chips"><div class="chip">Anime</div><div class="chip">Manga</div><div class="chip">Movies</div><div class="chip">Seasonal</div><div class="chip">Rankings</div></div>
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: "public/og-v3.png" });
await browser.close();
console.log(`Rendered public/og-v3.png with ${covers.length} real covers`);
