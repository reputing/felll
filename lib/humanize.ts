// "Humanize": rewrite stiff, AI-sounding prose so it reads like a person wrote it.
// Pure logic, no imports, so it runs on the server (the /api/shh route) and in
// tests. What it does: strips stock AI phrasing, softens em-dash habits, rewrites
// for rhythm and plain wording in a chosen voice (optionally matching a sample of
// the user's own writing), and then CHECKS the result kept every number, link and
// code block from the original. What it deliberately does not do: character-level
// tricks (invisible characters, look-alike letters, injected typos). Those are
// detector evasion, not writing, and they make text worse for the reader.

export type Strength = "light" | "medium" | "strong";
export type Tone = "casual" | "neutral" | "student";

export const STRENGTHS: Strength[] = ["light", "medium", "strong"];
export const TONES: Tone[] = ["casual", "neutral", "student"];

// ---- protecting what must not change -----------------------------------------
// Code fences, inline code, LaTeX and URLs are lifted out before any text rewrite
// and put back after, byte for byte.
const PROTECT = /```[\s\S]*?```|`[^`\n]+`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|https?:\/\/[^\s)<>"']+/g;

export function protect(text: string): { text: string; parts: string[] } {
  const parts: string[] = [];
  const out = text.replace(PROTECT, (m) => { parts.push(m); return `\u0000${parts.length - 1}\u0000`; });
  return { text: out, parts };
}
export function restore(text: string, parts: string[]): string {
  return text.replace(/\u0000(\d+)\u0000/g, (_, i) => parts[Number(i)] ?? "");
}

// ---- deterministic scrub of stock phrasing -----------------------------------
// Leading-clause phrases are dropped, and the next word is capitalised only when
// the phrase opened a sentence ("It is important to note that the war ended" ->
// "The war ended"; mid-sentence it just disappears). Kept conservative on purpose:
// every replacement is grammatical wherever the phrase can occur, and nothing
// capitalises text it did not touch (so "e.g. the" stays as written).
const APOS = "(?:'|\u2019)";
const DROP = new RegExp(
  "\\b(?:" + [
    "(?:in conclusion|to conclude|in summary|to sum up|all in all),",
    `(?:it is|it${APOS}s) (?:important|worth|crucial|essential|vital) to (?:note|mention|remember|understand|recognize)(?: that)?`,
    `(?:it is|it${APOS}s) worth noting(?: that)?`,
    "it should be noted that",
    "needless to say,",
  ].join("|") + ")\\s+([A-Za-z])?", "gi");

const atSentenceStart = (before: string) => before.trim() === "" || /[.!?]["')\]]*\s*$/.test(before) || /\n\s*$/.test(before);
const WORD_MAP = (map: Record<string, string>, fallback: string) => (m: string) => map[m.toLowerCase()] ?? fallback;
const SWAPS: [RegExp, string | ((m: string) => string)][] = [
  [/\b(?:furthermore|moreover|additionally),\s*/gi, (m: string) => (m[0] === m[0].toLowerCase() ? "also, " : "Also, ")],
  [new RegExp(`\\bin today${APOS}s (?:fast-paced |modern |digital )?world\\b`, "gi"), "today"],
  [/\bdelv(?:e|es) into\b/gi, "dig into"],
  [/\bdelved into\b/gi, "dug into"],
  [/\bdelving into\b/gi, "digging into"],
  [/\ba testament to\b/gi, "proof of"],
  [/\b(?:a )?rich tapestry of\b/gi, "a mix of"],
  [/\bnavigate the complexities of\b/gi, "deal with"],
  [/\bplays? a (?:crucial|pivotal|vital|key) role in\b/gi, "matters for"],
  [/\bin the realm of\b/gi, "in"],
  [/\ba myriad of\b/gi, "lots of"],
  [/\bmyriad\b/gi, "many"],
  [/\bever-evolving\b/gi, "changing"],
  [/\bgame-changer\b/gi, "big change"],
  [/\bseamlessly\b/gi, "smoothly"],
  [/\bleverag(?:e|es|ed|ing)\b/gi, WORD_MAP({ leverage: "use", leverages: "uses", leveraged: "used", leveraging: "using" }, "use")],
  [/\butiliz(?:e|es|ed|ing)\b/gi, WORD_MAP({ utilize: "use", utilizes: "uses", utilized: "used", utilizing: "using" }, "use")],
];

/** Deterministic cleanup of stock AI phrasing and dash habits. Safe on prose with
 *  code/math/URLs in it: those are protected and restored untouched. */
export function scrub(text: string): string {
  const { text: t0, parts } = protect(text);
  let t = t0.replace(DROP, (_m, next: string | undefined, offset: number, whole: string) => {
    if (!next) return "";
    return atSentenceStart(whole.slice(0, offset)) ? next.toUpperCase() : next;
  });
  for (const [re, rep] of SWAPS) t = typeof rep === "string" ? t.replace(re, rep) : t.replace(re, rep);
  // em dash used as a comma/aside -> comma
  t = t.replace(/\s*\u2014\s*/g, ", ").replace(/\s+\u2013\s+/g, ", ");
  t = t.replace(/,\s*,/g, ",").replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1");
  return restore(t, parts);
}

// ---- keeping the facts --------------------------------------------------------
export interface Facts { numbers: string[]; urls: string[]; code: string[] }

export function extractFacts(text: string): Facts {
  const code = text.match(/```[\s\S]*?```/g) ?? [];
  const urls = text.match(/https?:\/\/[^\s)<>"']+/g) ?? [];
  // numbers that carry meaning: skip list markers like "1." at the start of a line
  const body = text.replace(/```[\s\S]*?```/g, " ").replace(/^\s*\d+[.)]\s+/gm, "");
  const numbers = (body.match(/\d[\d,]*(?:\.\d+)?%?/g) ?? []).map((n) => n.replace(/,/g, ""));
  return { numbers: [...new Set(numbers)], urls: [...new Set(urls)], code: [...new Set(code)] };
}

/** What the rewrite lost: numbers, links or code blocks present in the original
 *  but absent from the output. Empty means the facts survived. */
export function missingFacts(original: string, rewritten: string): string[] {
  const f = extractFacts(original);
  const flat = rewritten.replace(/,/g, "");
  const out: string[] = [];
  for (const n of f.numbers) if (!flat.includes(n)) out.push(n);
  for (const u of f.urls) if (!rewritten.includes(u)) out.push(u);
  for (const c of f.code) if (!rewritten.includes(c)) out.push("a code block");
  return [...new Set(out)];
}

// ---- long text: rewrite paragraph-group by paragraph-group ---------------------
export function chunkParagraphs(text: string, max = 4500): string[] {
  const paras = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && (cur.length + p.length + 2) > max) { chunks.push(cur); cur = ""; }
    if (p.length > max) {
      // a single huge paragraph: split on sentence ends
      const sents = p.split(/(?<=[.!?])\s+/);
      let s = "";
      for (const x of sents) { if (s && s.length + x.length + 1 > max) { chunks.push(s); s = ""; } s += (s ? " " : "") + x; }
      if (s) cur = (cur ? cur + "\n\n" : "") + s;
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// ---- prompts ------------------------------------------------------------------
const STRENGTH_RULES: Record<Strength, string> = {
  light: "Make a light edit. Keep the structure and most sentences; replace stiff or stock phrasing with plainer wording, and vary a few sentence openings.",
  medium: "Rewrite so it reads like a person wrote it. Reshape sentences, mix short and long ones, prefer plain words and contractions where they fit, and drop filler.",
  strong: "Rewrite thoroughly in a loose, natural voice. Change the sentence structure freely, use contractions, allow the occasional short fragment or aside, and cut every bit of padding. The meaning must not change.",
};
const TONE_RULES: Record<Tone, string> = {
  casual: "Voice: relaxed and conversational, like explaining it to a friend.",
  neutral: "Voice: clear and natural, neither stiff nor slangy.",
  student: "Voice: how a capable high-school or college student writes: clear, direct, a little plain, no showy vocabulary.",
};
const TELLS = "Avoid these AI tells: \"delve\", \"tapestry\", \"testament\", \"multifaceted\", \"landscape\", \"in today's world\", \"it's important to note\", \"in conclusion\", stacking three adjectives or three examples every time, em dashes, hedging both sides of everything, every sentence the same length, and a closing sentence that restates the point.";

export function buildHumanizePrompt(o: { strength: Strength; tone: Tone; sample?: string }): string {
  const parts = [
    "You are a careful editor. Rewrite the user's text so it sounds like a real person wrote it.",
    STRENGTH_RULES[o.strength],
    TONE_RULES[o.tone],
    TELLS,
    "Hard rules: keep the meaning, every fact, name, number, date, quote, citation and link exactly as given. Do not add new claims or examples. Keep code blocks, math and markdown formatting (headings, lists, tables) as they are. Keep roughly the same length. Do not use invisible or look-alike characters.",
    "Output ONLY the rewritten text: no preface, no notes, no quotation marks around it.",
  ];
  const s = (o.sample ?? "").trim().slice(0, 3000);
  if (s) parts.push("Match this person's own voice: their sentence length, vocabulary level, punctuation habits and quirks. Here is a sample of how they write:\n\"\"\"\n" + s + "\n\"\"\"");
  return parts.join("\n\n");
}

/** A short version for the normal chat: write in this voice from the start. */
export function buildStyleGuide(tone: Tone = "neutral"): string {
  return "Write like a thoughtful person, not a template. " + TONE_RULES[tone] + " Mix sentence lengths, prefer plain words and contractions, skip filler openers and closing summaries. " + TELLS + " Keep every fact and number correct, and keep code and math formatting intact.";
}

// ---- measuring (used by tests and available to callers) ------------------------
export function stats(text: string) {
  const plain = text.replace(/```[\s\S]*?```/g, " ");
  const sents = plain.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const lens = sents.map((s) => s.split(/\s+/).length);
  const mean = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / (lens.length || 1));
  const dashes = (plain.match(/—/g) ?? []).length;
  return { words: plain.split(/\s+/).filter(Boolean).length, sentences: lens.length, meanLen: +mean.toFixed(1), sdLen: +sd.toFixed(1), dashes };
}

// ---- the rewrite loop ----------------------------------------------------------
export type Complete = (system: string, user: string) => Promise<{ text: string; error?: string }>;

/** Rewrite `text` in chunks via `complete`. Each chunk is checked against the
 *  original: if the rewrite dropped or changed a number, link or code block we ask
 *  once more, and if it still can't keep them we keep the ORIGINAL wording for that
 *  chunk (lightly cleaned) and say so, rather than return text with wrong facts. */
export async function humanizeText(
  text: string,
  o: { strength: Strength; tone: Tone; sample?: string },
  complete: Complete,
): Promise<{ text: string; warnings: string[]; error?: string }> {
  const system = buildHumanizePrompt(o);
  const chunks = chunkParagraphs(scrub(text));
  const out: string[] = [];
  const warnings: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let r = await complete(system, chunk);
    if (r.error) return { text: "", warnings, error: r.error };
    let lost = missingFacts(chunk, r.text);
    if (lost.length) {
      const again = await complete(system + `\n\nYour previous attempt dropped or changed: ${lost.join(", ")}. Rewrite again and keep every one of those exactly as written.`, chunk);
      if (!again.error) { r = again; lost = missingFacts(chunk, r.text); }
    }
    if (lost.length) {
      out.push(chunk);
      warnings.push(`kept your original wording for ${chunks.length > 1 ? `part ${i + 1}` : "the text"}, because the rewrite couldn't keep: ${lost.slice(0, 6).join(", ")}`);
    } else {
      out.push(r.text);
    }
  }
  return { text: scrub(out.join("\n\n")), warnings };
}
