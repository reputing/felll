// Turns the many ways a model writes math into the one the markdown renderer understands ($…$ and $$…$$), so a fraction
// shows as a fraction instead of "\frac{1}{2}". Code and math that is already delimited are left exactly as they are.

// A backslash followed by f, t, b, a, v or r is an escape in a JSON string: when a reply has been through one extra round of
// JSON parsing, "\frac" arrives as a form feed plus "rac" and "\times" as a tab plus "imes". These put the backslash back, for
// the commands that cannot be anything else.
const REPAIRS: [RegExp, string][] = [
  [/\x0Crac(?=\s*\{)/g, "\\frac"], [/\x0Corall\b/g, "\\forall"],
  [/\x09imes\b/g, "\\times"], [/\x09heta\b/g, "\\theta"], [/\x09ext(?=\s*\{)/g, "\\text"], [/\x09au\b/g, "\\tau"], [/\x09riangle\b/g, "\\triangle"], [/\x09an(?=[\s({^_])/g, "\\tan"],
  [/\x08eta\b/g, "\\beta"], [/\x08egin(?=\s*\{)/g, "\\begin"], [/\x08inom(?=\s*\{)/g, "\\binom"], [/\x08ar(?=\s*\{)/g, "\\bar"],
  [/\x07lpha\b/g, "\\alpha"], [/\x07ngle\b/g, "\\angle"], [/\x07pprox\b/g, "\\approx"],
  [/\x0Bec(?=\s*\{)/g, "\\vec"], [/\x0Bee\b/g, "\\vee"],
  [/\x0Dight(?=arrow|\)|\]|\b)/g, "\\right"], [/\x0Dho\b/g, "\\rho"],
];

// What must not be touched: fenced and inline code, and math that already has its dollar signs.
const PROTECTED = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g;

const BRACED = String.raw`\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}`;
const FRAC = String.raw`\\[dt]?frac\s*${BRACED}\s*${BRACED}`;
const SQRT = String.raw`\\sqrt(?:\[[^\]]*\])?\s*${BRACED}`;
const SYMBOL = String.raw`\\(?:times|cdot|pm|mp|leq?|geq?|neq|approx|infty|pi|theta|alpha|beta|gamma|delta|lambda|mu|sigma|omega|Delta|Sigma|sum|int|rightarrow|Rightarrow|to|div|degree|angle)(?![a-zA-Z])`;

// Each command is wrapped once, by a single pass: wrapping a fraction and then the root inside it would nest the dollar signs.
const BARE = new RegExp(`${FRAC}|${SQRT}|${SYMBOL}`, "g");
const wrapBare = (seg: string) => seg.replace(BARE, (m) => `$${m}$`);

// Phase 1: the other ways of delimiting math become dollar signs.
function delimiters(seg: string): string {
  let s = seg;
  // \[ ... \] is display math, \( ... \) is inline math
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => `\n\n$$${m.trim()}$$\n\n`);
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => `$${m.trim()}$`);
  // \begin{equation} ... \end{equation} and friends
  s = s.replace(/\\begin\{(equation|align|gather|eqnarray)\*?\}([\s\S]+?)\\end\{\1\*?\}/g, (_, env: string, m: string) => {
    const body = env === "align" || env === "eqnarray" ? `\\begin{aligned}${m}\\end{aligned}` : m.trim();
    return `\n\n$$${body}$$\n\n`;
  });
  // a line that is only "[ ... ]" around a formula is how some models write display math
  s = s.replace(/^[ \t]*\[[ \t]*([^[\]\n]*\\[a-zA-Z]+[^[\]\n]*?)[ \t]*\][ \t]*$/gm, (_, m: string) => `\n$$${m.trim()}$$\n`);
  return s;
}

// "$5 and $10" is two prices, not a formula: a dollar sign, a number, then a word is money, so the signs are escaped.
const looksLikeMoney = (m: string) => /^\$\d[\d.,]*\s+[A-Za-z]{2,}/.test(m) && !/[\\^_=]/.test(m);

/** Run `fn` on the text between the protected runs, leaving the protected runs as they are (or as `onProtected` says). */
function outside(s: string, fn: (seg: string) => string, onProtected: (m: string) => string = (m) => m): string {
  let out = "", last = 0, m: RegExpExecArray | null;
  const re = new RegExp(PROTECTED.source, "g");
  while ((m = re.exec(s))) { out += fn(s.slice(last, m.index)) + onProtected(m[0]); last = m.index + m[0].length; }
  return out + fn(s.slice(last));
}

export function normalizeMath(text: string): string {
  if (!text || !/[\\\x07-\x0D$]/.test(text)) return text;
  let s = text;
  for (const [re, to] of REPAIRS) s = s.replace(re, to);
  s = outside(s, delimiters, (m) => (m.startsWith("$") && !m.startsWith("$$") && looksLikeMoney(m) ? m.replace(/\$/g, "\\$") : m));
  if (!s.includes("\\")) return s;
  return outside(s, wrapBare);
}
