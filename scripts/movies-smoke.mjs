// Plays a handful of titles in a real browser and reports seconds to first
// picture. Run it ONE title at a time on purpose: five parallel contexts from
// one IP made a third of titles look "stuck" that played fine alone.
//
//   BASE=http://localhost:3000 TOKEN=<cupcake_session value> \
//     node scripts/movies-smoke.mjs movie-tt0080761 tv-tt31510819
//
// Needs playwright (already installed globally in the cloud sandbox).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE || "http://localhost:3000";
const TOKEN = process.env.TOKEN;
const slugs = process.argv.slice(2);
if (!TOKEN || !slugs.length) {
  console.error("usage: BASE=... TOKEN=<session cookie> node scripts/movies-smoke.mjs <movie-ttXXXX|tv-ttXXXX> ...");
  process.exit(2);
}

const host = new URL(BASE).hostname;
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
let bad = 0;
for (const slug of slugs) {
  const ctx = await b.newContext({ viewport: { width: 1000, height: 650 } });
  await ctx.addCookies([{ name: "cupcake_session", value: TOKEN, domain: host, path: "/" }]);
  const p = await ctx.newPage();
  const t0 = Date.now();
  let state = "no signal";
  await p.goto(`${BASE}/movies/${slug}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(1000);
    // the control bar clock reads "0:12 / 1:48:00" once cinesrc reports a duration
    const t = await p.locator("span.font-mono.tabular-nums").first().textContent().catch(() => "");
    if (/\/ \d+:\d\d/.test(t) && !/\/ 0:00\s*$/.test(t)) { state = "plays"; break; }
    if (await p.getByText(/taking too long|find this one right now|isn.t playing for people/).count()) { state = "stuck"; break; }
    if (await p.getByText("That page wandered off").count()) { state = "page error"; break; }
  }
  if (state !== "plays") bad++;
  console.log(slug.padEnd(18), state.padEnd(10), Math.round((Date.now() - t0) / 1000) + "s");
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
