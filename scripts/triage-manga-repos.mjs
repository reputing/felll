// Pass 5 (final): print exactly the router + the chapter/page-image handler for
// mangareader-api and VortexScansAPI, so adapters hit the right paths.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TARGETS = [
  { repo: "stabldev/mangareader-api", pick: /(router|read|image|page|chapter|constants)\.py$/i, dirs: ["app"] },
  { repo: "Shineii86/VortexScansAPI", pick: /(rout|index|chapter|read|page|series|manga|handler)\.(js|ts)$/i, dirs: ["api", "src", ""] },
];
const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
function walk(root, rel, out, depth) {
  if (depth > 4) return;
  let entries = []; try { entries = readdirSync(join(root, rel)); } catch { return; }
  for (const e of entries) {
    const r = rel ? join(rel, e) : e;
    let st; try { st = statSync(join(root, r)); } catch { continue; }
    if (st.isDirectory()) { if (!/node_modules|\.git|public|static|docs|tests|__pycache__|templates|node/.test(e)) walk(root, r, out, depth + 1); }
    else out.push(r);
  }
}
for (const { repo, pick, dirs } of TARGETS) {
  console.log("\n######## " + repo + " ########");
  const dir = mkdtempSync(join(tmpdir(), "c-"));
  try { execSync(`git clone --depth 1 https://github.com/${repo}.git "${dir}/r" 2>/dev/null`, { stdio: "ignore" }); }
  catch { console.log("clone failed"); continue; }
  const r = join(dir, "r");
  const files = [];
  for (const d of dirs) walk(r, d, files, 0);
  for (const f of [...new Set(files)].filter((f) => pick.test(f)).slice(0, 10)) {
    const body = read(join(r, f));
    if (!body.trim()) continue;
    console.log(`\n--- ${f} ---`);
    console.log(body.split("\n").slice(0, 55).join("\n"));
  }
}
console.log("\nDone.");
