"use client";
import { useEffect } from "react";

// Decoy screens — a boss-key cover for the private /shh corner. Each skin fills
// the viewport and looks, at a glance, like the schoolwork apps you actually
// use, so a shoulder-glance sees homework, not a chatbot. The real chat stays
// mounted underneath (even mid-stream); this is purely a visual lid.
//
// Word and W3Schools are styled after their current (2024/365) looks. Every
// skin reads its visible text from `cfg` so you can make the cover say whatever
// matches your real class/work (set in Customize, Decoy content).
//
// Press Esc, or click the top-left app icon, to lift the cover.

export const DECOY_SKINS: { id: string; label: string }[] = [
  { id: "word", label: "Word" },
  { id: "excel", label: "Excel" },
  { id: "w3schools", label: "W3Schools" },
  { id: "readingplus", label: "Reading Plus" },
  { id: "blank", label: "Blank screen" },
];

export interface DecoyConfig {
  wordTitle?: string; wordHeading?: string; wordBody?: string;
  excelTitle?: string; excelSheet?: string;
  w3Title?: string; w3Intro?: string;
  rpTitle?: string; rpBody?: string; rpLevel?: string;
}

const sys = "'Segoe UI', ui-sans-serif, system-ui, Roboto, Arial, sans-serif";
const paras = (text: string | undefined, fallback: string[]): string[] => {
  const t = (text ?? "").trim();
  if (!t) return fallback;
  return t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
};

// ---- Microsoft Word (Microsoft 365 / 2024 look) -------------------------------
function Word({ onExit, cfg }: { onExit: () => void; cfg: DecoyConfig }) {
  const tabs = ["File", "Home", "Insert", "Draw", "Design", "Layout", "References", "Mailings", "Review", "View", "Help"];
  const sep = <div style={{ width: 1, alignSelf: "stretch", background: "#e6e6e6", margin: "0 7px" }} />;
  const title = cfg.wordTitle || "Document1";
  const heading = cfg.wordHeading || "The Causes of the French Revolution";
  const body = paras(cfg.wordBody, [
    "The French Revolution of 1789 did not happen overnight. It grew out of decades of social, economic, and political tension within the Old Regime, a system that divided French society into three estates and placed the heaviest burdens on those least able to bear them.",
    "The First and Second Estates, made up of the clergy and the nobility, enjoyed sweeping privileges and paid almost no taxes. The Third Estate, which included everyone from wealthy merchants to struggling peasants, carried the financial weight of the entire nation.",
    "By the time the Estates-General convened in May 1789, years of famine, debt, and frustration had reached a breaking point…",
  ]);
  const words = (body.join(" ").split(/\s+/).length + heading.split(/\s+/).length);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#f5f5f5", fontFamily: sys, display: "flex", flexDirection: "column", color: "#242424" }}>
      {/* title bar (light, modern) */}
      <div style={{ background: "#fff", height: 44, display: "flex", alignItems: "center", padding: "0 12px", gap: 12, borderBottom: "1px solid #eee", fontSize: 12.5 }}>
        <button type="button" onClick={onExit} aria-label="menu" title=" " style={{ width: 24, height: 24, borderRadius: 5, border: "none", background: "#2b579a", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}>W</button>
        <span style={{ display: "flex", alignItems: "center", gap: 7, color: "#444" }}>
          <span style={{ width: 28, height: 15, background: "#2b579a", borderRadius: 8, position: "relative", display: "inline-block" }}><span style={{ position: "absolute", top: 1.5, right: 1.5, width: 12, height: 12, background: "#fff", borderRadius: "50%" }} /></span>
          AutoSave
        </span>
        <span style={{ color: "#444" }}>{title}</span>
        <span style={{ color: "#8a8886", fontSize: 12 }}>Saved to this PC</span>
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{ background: "#f3f2f1", borderRadius: 6, padding: "5px 12px", width: "min(420px,40vw)", color: "#8a8886", fontSize: 13 }}>🔍  Search</div>
        </div>
        <span style={{ width: 28, height: 28, borderRadius: "50%", background: "#c84c4c", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, flex: "none" }}>A</span>
        <span style={{ background: "#2b579a", color: "#fff", borderRadius: 5, padding: "6px 14px", fontWeight: 600, flex: "none" }}>Share</span>
        <span style={{ display: "flex", gap: 14, color: "#555", marginLeft: 4 }}><span>–</span><span>▢</span><span>✕</span></span>
      </div>
      {/* ribbon tabs */}
      <div style={{ background: "#fff", display: "flex", alignItems: "center", gap: 2, padding: "0 12px", height: 34, fontSize: 13 }}>
        {tabs.map((t) => (
          <span key={t} style={{ padding: "7px 10px", color: t === "File" ? "#fff" : "#444", background: t === "File" ? "#2b579a" : "transparent", borderRadius: t === "File" ? 4 : 0, borderBottom: t === "Home" ? "2.5px solid #2b579a" : "2.5px solid transparent", fontWeight: t === "Home" ? 600 : 400, cursor: "default" }}>{t}</span>
        ))}
      </div>
      {/* ribbon body */}
      <div style={{ background: "#fbfbfb", borderBottom: "1px solid #eaeaea", display: "flex", alignItems: "center", padding: "7px 14px", gap: 4, fontSize: 12, color: "#444", minHeight: 76, overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><span style={{ fontSize: 22 }}>📋</span><span>Paste</span></div>
        {sep}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ border: "1px solid #d9d9d9", background: "#fff", padding: "3px 7px", borderRadius: 4, width: 128, display: "flex", justifyContent: "space-between" }}>Calibri (Body) <span>▾</span></span>
            <span style={{ border: "1px solid #d9d9d9", background: "#fff", padding: "3px 7px", borderRadius: 4 }}>11 ▾</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 15, color: "#444" }}>
            <b>B</b><i>I</i><u>U</u><span style={{ textDecoration: "line-through" }}>ab</span><span>x²</span><span style={{ color: "#c00" }}>A</span><span style={{ background: "#ffff00", color: "#444", padding: "0 2px", borderRadius: 2 }}>A</span>
          </div>
        </div>
        {sep}
        <div style={{ display: "flex", gap: 7 }}>
          {["Normal", "No Spacing", "Heading 1", "Heading 2", "Title"].map((s, i) => (
            <div key={s} style={{ border: "1px solid #e4e4e4", background: "#fff", borderRadius: 4, width: 80, height: 46, padding: "5px 7px", fontSize: 10.5, color: i >= 2 ? "#2b579a" : "#444", fontWeight: i >= 2 ? 700 : 400, overflow: "hidden" }}>{s}<div style={{ marginTop: 3, fontSize: 9, color: "#aaa" }}>AaBbCcDd</div></div>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><span style={{ fontSize: 19 }}>🎤</span><span>Dictate</span></div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: "#2b579a" }}><span style={{ fontSize: 19 }}>✏️</span><span>Editor</span></div>
        </div>
      </div>
      {/* ruler */}
      <div style={{ background: "#f5f5f5", height: 18, display: "flex", justifyContent: "center", paddingTop: 2 }}>
        <div style={{ width: "min(816px,92vw)", height: 12, background: "#fff", border: "1px solid #e0e0e0", borderRadius: 2 }} />
      </div>
      {/* page */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 16px 40px", display: "flex", justifyContent: "center" }}>
        <div contentEditable suppressContentEditableWarning spellCheck={false}
          style={{ width: "min(816px,92vw)", minHeight: "95%", background: "#fff", boxShadow: "0 1px 6px rgba(0,0,0,.14)", padding: "80px 92px", outline: "none", fontFamily: "Calibri, 'Segoe UI', sans-serif", fontSize: 15, lineHeight: 1.85, color: "#242424" }}>
          <p style={{ textAlign: "center", fontSize: 17, fontWeight: 700, margin: "0 0 18px" }}>{heading}</p>
          {body.map((p, i) => <p key={i} style={{ margin: i === body.length - 1 ? 0 : "0 0 14px" }}>&emsp;{p}</p>)}
        </div>
      </div>
      {/* status bar (light, modern) */}
      <div style={{ background: "#f3f2f1", borderTop: "1px solid #e4e4e4", color: "#444", height: 24, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 12, gap: 18 }}>
        <span>Page 1 of 1</span><span>{words} words</span><span>English (United States)</span><span>Text Predictions: On</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center" }}><span>Focus</span><span>100%</span></span>
      </div>
    </div>
  );
}

// ---- Excel --------------------------------------------------------------------
function Excel({ onExit, cfg }: { onExit: () => void; cfg: DecoyConfig }) {
  const tabs = ["File", "Home", "Insert", "Draw", "Page Layout", "Formulas", "Data", "Review", "View", "Help"];
  const cols = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const rows = Array.from({ length: 30 }, (_, i) => i + 1);
  const data: Record<string, string> = { A1: "Month", B1: "Income", C1: "Expenses", D1: "Savings",
    A2: "January", B2: "1200", C2: "950", D2: "250", A3: "February", B3: "1200", C3: "880", D3: "320", A4: "March", B4: "1350", C4: "1010", D4: "340", A5: "April", B5: "1200", C5: "1120", D5: "80" };
  const title = cfg.excelTitle || "Book1";
  const sheet = cfg.excelSheet || "Sheet1";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#fff", fontFamily: sys, display: "flex", flexDirection: "column", color: "#242424" }}>
      <div style={{ background: "#fff", height: 44, display: "flex", alignItems: "center", padding: "0 12px", gap: 12, borderBottom: "1px solid #eee", fontSize: 12.5 }}>
        <button type="button" onClick={onExit} aria-label="menu" title=" " style={{ width: 24, height: 24, borderRadius: 5, border: "none", background: "#217346", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}>X</button>
        <span style={{ color: "#444" }}>{title}</span>
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{ background: "#f3f2f1", borderRadius: 6, padding: "5px 12px", width: "min(420px,40vw)", color: "#8a8886", fontSize: 13 }}>🔍  Search</div>
        </div>
        <span style={{ width: 28, height: 28, borderRadius: "50%", background: "#217346", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, flex: "none" }}>A</span>
        <span style={{ background: "#217346", color: "#fff", borderRadius: 5, padding: "6px 14px", fontWeight: 600, flex: "none" }}>Share</span>
        <span style={{ display: "flex", gap: 14, color: "#555" }}><span>–</span><span>▢</span><span>✕</span></span>
      </div>
      <div style={{ background: "#fff", display: "flex", alignItems: "center", gap: 2, padding: "0 12px", height: 32, fontSize: 13 }}>
        {tabs.map((t) => <span key={t} style={{ padding: "6px 9px", color: t === "File" ? "#fff" : "#444", background: t === "File" ? "#217346" : "transparent", borderBottom: t === "Home" ? "2.5px solid #217346" : "2.5px solid transparent", fontWeight: t === "Home" ? 600 : 400, borderRadius: t === "File" ? 4 : 0 }}>{t}</span>)}
      </div>
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #e1dfdd", borderTop: "1px solid #eee", fontSize: 13, color: "#333" }}>
        <div style={{ width: 90, padding: "4px 8px", borderRight: "1px solid #e1dfdd" }}>D6</div>
        <div style={{ padding: "4px 10px", color: "#888", fontStyle: "italic" }}>fx</div>
        <div style={{ flex: 1, padding: "4px 8px", borderLeft: "1px solid #e1dfdd" }}>=B6-C6</div>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "max-content" }}>
          <thead><tr><th style={{ width: 36, background: "#f3f2f1", border: "1px solid #d0d0d0" }}></th>{cols.map((c) => <th key={c} style={{ width: 88, background: "#f3f2f1", border: "1px solid #d0d0d0", color: "#555", fontWeight: 500, padding: "3px 0" }}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <td style={{ background: "#f3f2f1", border: "1px solid #d0d0d0", color: "#555", textAlign: "center", fontWeight: 500 }}>{r}</td>
                {cols.map((c) => { const v = data[`${c}${r}`] || ""; const head = r === 1; const num = ["B", "C", "D"].includes(c) && !head && v; return <td key={c} style={{ border: "1px solid #e4e4e4", height: 22, padding: "0 6px", background: head ? "#e7f0ea" : "#fff", fontWeight: head ? 700 : 400, textAlign: num ? "right" : "left" }}>{num ? `$${v}` : v}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ borderTop: "1px solid #e1dfdd", display: "flex", alignItems: "center", fontSize: 12, color: "#444", padding: "3px 10px", gap: 10 }}>
        <span style={{ borderBottom: "2px solid #217346", fontWeight: 700, padding: "2px 10px" }}>{sheet}</span><span style={{ color: "#999" }}>+</span>
        <span style={{ marginLeft: "auto", color: "#555" }}>Ready</span><span style={{ color: "#555" }}>100%</span>
      </div>
    </div>
  );
}

// ---- W3Schools (current look) -------------------------------------------------
function W3Schools({ onExit, cfg }: { onExit: () => void; cfg: DecoyConfig }) {
  const left = ["HTML HOME", "HTML Introduction", "HTML Editors", "HTML Basic", "HTML Elements", "HTML Attributes", "HTML Headings", "HTML Paragraphs", "HTML Styles", "HTML Formatting", "HTML Links", "HTML Images", "HTML Tables", "HTML Lists"];
  const title = cfg.w3Title || "HTML Introduction";
  const intro = cfg.w3Intro || "HTML is the standard markup language for creating Web pages.";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#fff", fontFamily: "'Source Sans Pro', Verdana, sans-serif", display: "flex", flexDirection: "column", color: "#000", overflow: "hidden" }}>
      {/* top nav */}
      <div style={{ background: "#282a35", color: "#fff", height: 48, display: "flex", alignItems: "center", padding: "0 16px", gap: 18, fontSize: 14, flex: "none" }}>
        <button type="button" onClick={onExit} aria-label="home" title=" " style={{ border: "none", background: "transparent", color: "#fff", fontSize: 20, fontWeight: 700, cursor: "pointer", letterSpacing: "-.5px" }}>
          <span style={{ color: "#04AA6D" }}>W3</span>schools
        </button>
        <span style={{ opacity: 0.9 }}>Tutorials</span><span style={{ opacity: 0.9 }}>Exercises</span><span style={{ opacity: 0.9 }}>Certificates</span><span style={{ opacity: 0.9 }}>Services</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 17 }}>🔍</span>
          <span style={{ fontSize: 17 }}>☀️</span>
          <span style={{ background: "#fff4a3", color: "#000", borderRadius: 4, padding: "6px 14px", fontWeight: 700 }}>Spaces</span>
          <span style={{ background: "#04AA6D", color: "#fff", borderRadius: 4, padding: "6px 14px", fontWeight: 700 }}>Sign Up</span>
          <span style={{ background: "#fff", color: "#000", borderRadius: 4, padding: "6px 14px", fontWeight: 700 }}>Log in</span>
        </span>
      </div>
      {/* green sub bar */}
      <div style={{ background: "#04AA6D", color: "#fff", height: 38, display: "flex", alignItems: "center", padding: "0 16px", gap: 22, fontSize: 13.5, flex: "none" }}>
        <span>❮ HTML Introduction</span><span style={{ marginLeft: "auto" }}>HTML Editors ❯</span>
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ width: 220, background: "#f1f1f1", overflow: "auto", flex: "none" }}>
          {left.map((l, i) => (
            <div key={l} style={{ padding: "9px 16px", fontSize: 13.5, borderBottom: "1px solid #ddd", background: i === 1 ? "#04AA6D" : "transparent", color: i === 1 ? "#fff" : "#000", fontWeight: i === 1 ? 700 : 400 }}>{l}</div>
          ))}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "22px 32px", maxWidth: 820 }}>
          <h1 style={{ fontSize: 34, margin: "0 0 6px", fontWeight: 400 }}>{title}</h1>
          <div style={{ display: "flex", justifyContent: "space-between", margin: "14px 0" }}>
            <span style={{ background: "#f1f1f1", color: "#000", padding: "8px 16px", borderRadius: 4, fontWeight: 700 }}>❮ Previous</span>
            <span style={{ background: "#04AA6D", color: "#fff", padding: "8px 16px", borderRadius: 4, fontWeight: 700 }}>Next ❯</span>
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.6 }}>{intro}</p>
          <h2 style={{ fontSize: 24, fontWeight: 400, marginTop: 22 }}>What is HTML?</h2>
          <ul style={{ fontSize: 15, lineHeight: 1.7 }}>
            <li>HTML stands for Hyper Text Markup Language</li>
            <li>HTML is the standard markup language for creating Web pages</li>
            <li>HTML describes the structure of a Web page</li>
            <li>HTML elements tell the browser how to display the content</li>
          </ul>
          <div style={{ background: "#e7e9eb", borderRadius: 5, padding: 18, marginTop: 18 }}>
            <h3 style={{ margin: "0 0 10px", fontWeight: 400 }}>Example</h3>
            <pre style={{ background: "#fff", padding: 14, borderRadius: 4, fontFamily: "Consolas, monospace", fontSize: 14, lineHeight: 1.5, overflow: "auto", margin: 0, color: "#000" }}>{`<!DOCTYPE html>
<html>
<head>
  <title>Page Title</title>
</head>
<body>
  <h1>My First Heading</h1>
  <p>My first paragraph.</p>
</body>
</html>`}</pre>
            <div style={{ background: "#04AA6D", color: "#fff", display: "inline-block", padding: "10px 18px", borderRadius: 4, marginTop: 14, fontWeight: 700, fontSize: 14 }}>Try it Yourself »</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Reading Plus -------------------------------------------------------------
function ReadingPlus({ onExit, cfg }: { onExit: () => void; cfg: DecoyConfig }) {
  const title = cfg.rpTitle || "The Secret Life of Honeybees";
  const level = cfg.rpLevel || "Level J";
  const body = paras(cfg.rpBody, [
    "Inside a single hive, tens of thousands of honeybees work together with remarkable coordination. Each bee has a role, and those roles shift as the bee grows older. Young workers clean cells and care for the developing young, while older bees venture out to gather nectar and pollen.",
    "When a forager discovers a rich patch of flowers, she returns to the hive and performs a “waggle dance.” The direction and length of the dance tell the other bees exactly where to find the food, sometimes miles away.",
    "This ability to share precise information makes the colony far more efficient than any single bee could ever be on its own…",
  ]);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#eef2f6", fontFamily: sys, display: "flex", flexDirection: "column", color: "#22313f" }}>
      <div style={{ background: "#0b6fb3", color: "#fff", height: 54, display: "flex", alignItems: "center", padding: "0 20px", gap: 16, flex: "none" }}>
        <button type="button" onClick={onExit} aria-label="home" title=" " style={{ border: "none", background: "transparent", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 19, fontWeight: 800 }}>
          <span style={{ width: 28, height: 28, borderRadius: "50%", background: "#fff", color: "#0b6fb3", display: "grid", placeItems: "center", fontSize: 17 }}>R</span>
          Reading<span style={{ fontWeight: 400 }}>Plus</span>
        </button>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 20, fontSize: 14 }}>
          <span style={{ background: "rgba(255,255,255,.2)", padding: "5px 12px", borderRadius: 14 }}>{level}</span>
          <span>⏱ 18:42</span>
          <span style={{ width: 32, height: 32, borderRadius: "50%", background: "#f4a62a", display: "grid", placeItems: "center", fontWeight: 700 }}>A</span>
        </span>
      </div>
      <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center", padding: "26px 16px" }}>
        <div style={{ width: "min(760px,96vw)", background: "#fff", borderRadius: 10, boxShadow: "0 2px 12px rgba(0,0,0,.08)", padding: "34px 44px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0b6fb3", textTransform: "uppercase", letterSpacing: ".5px" }}>Reading Selection · 2 of 5</span>
            <span style={{ fontSize: 13, color: "#8a97a3" }}>Comprehension</span>
          </div>
          <h1 style={{ fontSize: 26, margin: "0 0 18px", fontWeight: 700 }}>{title}</h1>
          {body.map((p, i) => <p key={i} style={{ fontSize: 17, lineHeight: 1.95, margin: i === body.length - 1 ? 0 : "0 0 16px", color: i === 0 ? "#22313f" : i === body.length - 1 ? "#5a6b7b" : "#2f4256" }}>{p}</p>)}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 26 }}>
            <span style={{ background: "#0b6fb3", color: "#fff", padding: "11px 30px", borderRadius: 24, fontWeight: 700, fontSize: 15 }}>Continue ❯</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Decoy({ skin, onExit, config }: { skin: string; onExit: () => void; config?: DecoyConfig }) {
  // Esc always lifts the cover, so you can never get stuck behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onExit(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  const cfg = config || {};
  if (skin === "word") return <Word onExit={onExit} cfg={cfg} />;
  if (skin === "excel") return <Excel onExit={onExit} cfg={cfg} />;
  if (skin === "w3schools") return <W3Schools onExit={onExit} cfg={cfg} />;
  if (skin === "readingplus") return <ReadingPlus onExit={onExit} cfg={cfg} />;
  // "blank" (and any unknown) -> a plain innocuous white screen
  return <div onClick={onExit} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#ffffff", cursor: "pointer" }} aria-hidden />;
}
