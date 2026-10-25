// Pass 4: dump the API contract of VortexScansAPI and mangareader-api only, so
// the frontend adapters map their real response fields.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TARGETS = [
  { repo: "Shineii86/VortexScansAPI", dirs: ["api", "src", ""] },
  { repo: "stabldev/mangareader-api", dirs: ["app", ""] },
];
const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

function walk(root, rel, out, depth) {
  if (depth > 3) return;
  let entries = [];
  try { entries = readdirSync(join(root, rel)); } catch { return; }
  for (const e of entries) {
    const r = rel ? join(rel, e) : e;
    let st; try { st = statSync(join(root, r)); } catch { continue; }
    if (st.isDirectory()) { if (!/node_modules|\.git|public|static|docs|tests|__pycache__|templates/.test(e)) walk(root, r, out, depth + 1); }
    else if (/\.(js|ts|py)$/.test(e) && !/\.test\.|\.spec\.|config|rate|cache|utils|__init__/.test(e)) out.push(r);
  }
}

for (const { repo, dirs } of TARGETS) {
  console.log("\n######## " + repo + " ########");
  const dir = mkdtempSync(join(tmpdir(), "c-"));
  try { execSync(`git clone --depth 1 https://github.com/${repo}.git "${dir}/r" 2>/dev/null`, { stdio: "ignore" }); }
  catch { console.log("clone failed"); continue; }
  const r = join(dir, "r");
  const files = [];
  for (const d of dirs) walk(r, d, files, 0);
  const uniq = [...new Set(files)].filter((f) => /rout|controller|handler|manga|chapter|search|series|read|scrap|server|main|api/i.test(f)).slice(0, 12);
  for (const f of uniq) {
    const body = read(join(r, f));
    if (!body.trim()) continue;
    console.log(`\n--- ${f} ---`);
    console.log(body.split("\n").slice(0, 60).join("\n"));
  }
}
console.log("\nDone.");
