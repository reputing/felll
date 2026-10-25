// Pass 2: for the repos that ARE real self-host manga servers, dump the exact
// facts needed to write a correct Cloudflare Container Dockerfile — run command,
// port, build step, any existing Dockerfile. Runs in CI.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SERVERS = [
  "stabldev/mangareader-api",
  "Shineii86/VortexScansAPI",
  "Shineii86/OmegaAPI",
  "febryardiansyah/manga-api",
  "la-lo-go/man-go",
  "sologoloo/mangpi",
  "walterwhite-69/MangaVault",
];

const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
const grepAll = (text, re) => [...new Set((text.match(re) || []))].slice(0, 6).join("  ");

for (const repo of SERVERS) {
  console.log("\n==================== " + repo + " ====================");
  const dir = mkdtempSync(join(tmpdir(), "mr-"));
  try {
    execSync(`git clone --depth 1 https://github.com/${repo}.git "${dir}/r" 2>/dev/null`, { stdio: "ignore" });
  } catch { console.log("  clone failed"); continue; }
  const r = join(dir, "r");
  const files = readdirSync(r);

  // package.json scripts + engines
  if (files.includes("package.json")) {
    try {
      const pkg = JSON.parse(read(join(r, "package.json")));
      console.log("  scripts:", JSON.stringify(pkg.scripts || {}));
      console.log("  main:", pkg.main || "-", " engines:", JSON.stringify(pkg.engines || {}));
    } catch { /* */ }
  }
  // python entry
  for (const f of ["requirements.txt", "pyproject.toml", "Procfile", "vercel.json", "railway.json", "render.yaml", "Makefile", "setup.sh"]) {
    if (files.includes(f)) console.log(`  ${f}:`, read(join(r, f)).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 8).join(" | ").slice(0, 300));
  }
  // existing Dockerfile / compose (reuse if present)
  for (const f of ["Dockerfile", "docker-compose.yml", "compose.yaml"]) {
    if (files.includes(f)) console.log(`  ==${f}==\n` + read(join(r, f)).split("\n").slice(0, 30).map((l) => "    " + l).join("\n"));
  }
  // how the port is set + the listen call, scanning likely entry files
  let scan = "";
  for (const f of ["server.js", "index.js", "app.js", "main.py", "app.py", "api.py", "main.go", "index.ts", "server.ts"]) {
    if (existsSync(join(r, f))) scan += read(join(r, f));
    if (existsSync(join(r, "src", f))) scan += read(join(r, "src", f));
  }
  console.log("  PORT refs:", grepAll(scan, /(?:PORT|listen\(|uvicorn|app\.run|\.Run\(|Listen\()[^\n;]{0,40}/gi) || "(none found in common entry files)");
}
console.log("\nDone.");
