// Clones each candidate manga repo (shallow) and reports what it actually is, so
// we containerize only the ones that are genuine self-host manga SERVERS with an
// HTTP API — not libraries, Telegram bots, or "host your own files" servers.
// Runs in CI (runners have git + internet; the sandbox does not).
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPOS = [
  "fumiama/copymanga",
  "febryardiansyah/manga-api",
  "Mangatsu/server",
  "stabldev/mangareader-api",
  "sologoloo/mangpi",
  "walterwhite-69/MangaVault",
  "Shineii86/OmegaAPI",
  "Nyora-Manga/nyora-js",
  "la-lo-go/man-go",
  "Shineii86/VortexScansAPI",
  "editinghero/Koka",
];

const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
const firstLines = (s, n) => s.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, n).join("  |  ");
const grepPort = (text) => {
  const m = text.match(/(?:PORT|listen|EXPOSE|addr)\D{0,12}(\d{2,5})/i);
  return m ? m[1] : "?";
};

for (const repo of REPOS) {
  console.log("\n==================== " + repo + " ====================");
  const dir = mkdtempSync(join(tmpdir(), "mr-"));
  let ok = false;
  for (const branch of ["", "-b main", "-b master"]) {
    try {
      execSync(`git clone --depth 1 ${branch} https://github.com/${repo}.git "${dir}/r" 2>/dev/null`, { stdio: "ignore" });
      ok = true; break;
    } catch { /* try next */ }
  }
  if (!ok) { console.log("  CLONE FAILED (missing/renamed/private)"); continue; }
  const r = join(dir, "r");
  const files = readdirSync(r);

  // stack
  const hasPkg = files.includes("package.json");
  const hasGo = files.includes("go.mod") || files.some((f) => f.endsWith(".go"));
  const hasReq = files.includes("requirements.txt") || files.includes("pyproject.toml") || files.includes("Pipfile");
  const hasDocker = files.includes("Dockerfile") || files.includes("docker-compose.yml") || files.includes("compose.yaml");
  const stack = [hasPkg && "node", hasGo && "go", hasReq && "python", hasDocker && "docker"].filter(Boolean).join("+") || "unknown";

  // server-ness
  let start = "", main = "", deps = "";
  if (hasPkg) {
    try {
      const pkg = JSON.parse(read(join(r, "package.json")));
      start = pkg.scripts?.start || pkg.scripts?.serve || pkg.scripts?.dev || "";
      main = pkg.main || "";
      deps = Object.keys({ ...pkg.dependencies }).slice(0, 12).join(",");
    } catch { /* */ }
  }
  const serverHints = [];
  const allText = files.map((f) => f.toLowerCase()).join(" ");
  if (/express|fastify|koa|hapi|http|server/.test(deps)) serverHints.push("http-dep");
  if (/telegraf|grammy|telegram|bot/.test(deps + " " + allText)) serverHints.push("TELEGRAM-BOT");
  if (files.some((f) => /^(server|app|main|index)\.(js|ts|go|py)$/i.test(f))) serverHints.push("entry-file");

  // what it serves + port, from the README
  const readme = read(join(r, "README.md")) || read(join(r, "readme.md")) || read(join(r, "README.rst"));
  const port = grepPort(readme + " " + read(join(r, "Dockerfile")) + " " + read(join(r, "docker-compose.yml")));

  console.log(`  stack: ${stack}   port: ${port}`);
  console.log(`  pkg.main: ${main || "-"}   start: ${start || "-"}`);
  if (deps) console.log(`  deps: ${deps}`);
  console.log(`  server hints: ${serverHints.join(", ") || "(none obvious)"}`);
  console.log(`  files: ${files.filter((f) => !f.startsWith(".")).slice(0, 18).join(", ")}`);
  console.log(`  README: ${firstLines(readme, 6) || "(no README)"}`);
}
console.log("\nDone.");
