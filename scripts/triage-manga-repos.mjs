// Pass 3: dump the API contract (routes + response shaping) of the English
// self-host servers, so the frontend adapters map real fields, not guesses.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const TARGETS = [
  { repo: "Shineii86/VortexScansAPI", dirs: ["", "api", "src"] },
  { repo: "stabldev/mangareader-api", dirs: ["app", ""] },
  { repo: "Shineii86/OmegaAPI", dirs: ["src/app/api", "src/pages/api", "src/app", "src"] },
];
const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

function walk(root, rel, out, depth) {
  if (depth > 3) return;
  let entries = [];
  try { entries = readdirSync(join(root, rel)); } catch { return; }
  for (const e of entries) {
    const r = rel ? join(rel, e) : e;
    let st; try { st = statSync(join(root, r)); } catch { continue; }
    if (st.isDirectory()) { if (!/node_modules|\.git|public|static|docs|tests|__pycache__/.test(e)) walk(root, r, out, depth + 1); }
    else if (/\.(js|ts|py)$/.test(e) && !/\.test\.|\.spec\./.test(e)) out.push(r);
  }
}

for (const { repo, dirs } of TARGETS) {
  console.log("\n######################## " + repo + " ########################");
  const dir = mkdtempSync(join(tmpdir(), "c-"));
  try { execSync(`git clone --depth 1 https://github.com/${repo}.git "${dir}/r" 2>/dev/null`, { stdio: "ignore" }); }
  catch { console.log("clone failed"); continue; }
  const r = join(dir, "r");
  const files = [];
  for (const d of dirs) walk(r, d, files, 0);
  const uniq = [...new Set(files)].filter((f) => /rout|controller|handler|manga|chapter|search|index|server|main|app|api/i.test(f)).slice(0, 14);
  for (const f of uniq) {
    const body = read(join(r, f));
    if (!body.trim()) continue;
    console.log(`\n----- ${f} (${body.split("\n").length} lines) -----`);
    console.log(body.split("\n").slice(0, 70).join("\n"));
  }
}
console.log("\nDone.");
