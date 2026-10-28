"use client";
import { useEffect } from "react";

// Decoy screens — a boss-key cover for the private /shh corner. When shown, each
// skin fills the viewport and looks, at a glance, like the schoolwork apps you
// actually use, so a shoulder-glance sees homework, not a chatbot. The real chat
// stays mounted underneath (even mid-stream); this is purely a visual lid.
//
// Press Esc, or click the top-left app icon, to lift the cover.

export const DECOY_SKINS: { id: string; label: string }[] = [
  { id: "word", label: "Word" },
  { id: "excel", label: "Excel" },
  { id: "w3schools", label: "W3Schools" },
  { id: "readingplus", label: "Reading Plus" },
  { id: "blank", label: "Blank screen" },
];

const sys = "'Segoe UI', ui-sans-serif, system-ui, Roboto, Arial, sans-serif";

// ---- Microsoft Word (the detailed one) ----------------------------------------
function Word({ onExit }: { onExit: () => void }) {
  const tabs = ["File", "Home", "Insert", "Draw", "Design", "Layout", "References", "Mailings", "Review", "View", "Help"];
  const sep = <div style={{ width: 1, alignSelf: "stretch", background: "#e1dfdd", margin: "0 8px" }} />;
  const ico: React.CSSProperties = { fontSize: 15, color: "#444", lineHeight: 1 };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#f3f2f1", fontFamily: sys, display: "flex", flexDirection: "column", color: "#201f1e" }}>
      {/* title bar */}
      <div style={{ background: "#2b579a", color: "#fff", height: 34, display: "flex", alignItems: "center", padding: "0 10px", gap: 10, fontSize: 12.5 }}>
        <button type="button" onClick={onExit} aria-label="menu" title=" " style={{ width: 20, height: 20, borderRadius: 3, border: "none", background: "#fff", color: "#2b579a", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "grid", placeItems: "center" }}>W</button>
        <span style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.95 }}>
          <span style={{ width: 24, height: 14, background: "rgba(255,255,255,.25)", borderRadius: 7, display: "inline-block", position: "relative" }}><span style={{ position: "absolute", top: 1, left: 1, width: 12, height: 12, background: "#fff", borderRadius: "50%" }} /></span>
          AutoSave
        </span>
        <span style={{ flex: 1, textAlign: "center", fontWeight: 400 }}>Document1 - Word</span>
        <span style={{ display: "flex", gap: 16, opacity: 0.9 }}><span>—</span><span>▢</span><span>✕</span></span>
      </div>
      {/* ribbon tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #edebe9", display: "flex", alignItems: "center", gap: 2, padding: "0 10px", height: 32, fontSize: 13 }}>
        {tabs.map((t, i) => (
          <span key={t} style={{ padding: "6px 9px", color: t === "File" ? "#fff" : "#444", background: t === "File" ? "#2b579a" : "transparent", borderBottom: t === "Home" ? "2px solid #2b579a" : "2px solid transparent", fontWeight: t === "Home" ? 600 : 400, borderRadius: t === "File" ? 2 : 0, cursor: "default" }}>{t}{i === 0 ? "" : ""}</span>
        ))}
      </div>
      {/* ribbon body (Home) */}
      <div style={{ background: "#faf9f8", borderBottom: "1px solid #edebe9", display: "flex", alignItems: "center", padding: "6px 12px", gap: 4, fontSize: 12, color: "#444", overflow: "hidden", minHeight: 74 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><span style={{ fontSize: 22 }}>📋</span><span>Paste</span></div>
        {sep}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ border: "1px solid #d2d0ce", background: "#fff", padding: "2px 6px", borderRadius: 2, width: 120, display: "flex", justifyContent: "space-between" }}>Calibri (Body) <span>▾</span></span>
            <span style={{ border: "1px solid #d2d0ce", background: "#fff", padding: "2px 6px", borderRadius: 2 }}>11 ▾</span>
          </div>
          <div style={{ display: "flex", gap: 9, alignItems: "center", ...ico }}>
            <b>B</b><i>I</i><u>U</u><span style={{ textDecoration: "line-through" }}>ab</span><span>x²</span><span style={{ color: "#c00" }}>A</span><span style={{ background: "#ffff00", color: "#444", padding: "0 2px" }}>A</span>
          </div>
        </div>
        {sep}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, ...ico }}>
          <div style={{ display: "flex", gap: 8 }}><span>☰</span><span>≡</span><span>⠿</span><span>⇥</span></div>
          <div style={{ display: "flex", gap: 8 }}><span>⯇</span><span>↕</span><span>¶</span><span>⫶</span></div>
        </div>
        {sep}
        <div style={{ display: "flex", gap: 6 }}>
          {["Normal", "No Spacing", "Heading 1", "Heading 2", "Title"].map((s, i) => (
            <div key={s} style={{ border: "1px solid #e1dfdd", background: "#fff", borderRadius: 2, width: 78, height: 44, padding: "4px 6px", fontSize: 10.5, color: i >= 2 ? "#2b579a" : "#444", fontWeight: i >= 2 ? 700 : 400, overflow: "hidden" }}>{s}<div style={{ marginTop: 3, fontSize: 9, color: "#999" }}>AaBbCcDd</div></div>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><span style={{ fontSize: 20 }}>🔍</span><span>Find</span></div>
      </div>
      {/* ruler */}
      <div style={{ background: "#fff", borderBottom: "1px solid #edebe9", height: 18, display: "flex", justifyContent: "center" }}>
        <div style={{ width: "min(816px,94vw)", borderLeft: "1px solid #cfcfcf", borderRight: "1px solid #cfcfcf", background: "repeating-linear-gradient(90deg,#fff 0 47px,#e8e8e8 47px 48px)" }} />
      </div>
      {/* page */}
      <div style={{ flex: 1, overflow: "auto", padding: "22px 16px", display: "flex", justifyContent: "center" }}>
        <div contentEditable suppressContentEditableWarning spellCheck={false}
          style={{ width: "min(816px,94vw)", minHeight: "92%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.18)", padding: "84px 96px", outline: "none", fontFamily: "Calibri, 'Segoe UI', sans-serif", fontSize: 15, lineHeight: 1.85, color: "#201f1e" }}>
          <p style={{ textAlign: "center", fontSize: 17, fontWeight: 700, margin: "0 0 18px" }}>The Causes of the French Revolution</p>
          <p style={{ margin: "0 0 14px" }}>&emsp;The French Revolution of 1789 did not happen overnight. It grew out of decades of social, economic, and political tension within the Old Regime, a system that divided French society into three estates and placed the heaviest burdens on those least able to bear them.</p>
          <p style={{ margin: "0 0 14px" }}>&emsp;The First and Second Estates, made up of the clergy and the nobility, enjoyed sweeping privileges and paid almost no taxes. The Third Estate, which included everyone from wealthy merchants to struggling peasants, carried the financial weight of the entire nation.</p>
          <p style={{ margin: 0 }}>&emsp;By the time the Estates-General convened in May 1789, years of famine, debt, and frustration had reached a breaking point&hellip;</p>
        </div>
      </div>
      {/* status bar */}
      <div style={{ background: "#2b579a", color: "#fff", height: 24, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 12, gap: 18 }}>
        <span>Page 1 of 1</span><span>412 words</span><span>English (United States)</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center" }}><span>▤ ▦ ▥</span><span>- ⎯⎯⎯⎯⦿⎯ +</span><span>100%</span></span>
      </div>
    </div>
  );
}

// ---- Excel --------------------------------------------------------------------
function Excel({ onExit }: { onExit: () => void }) {
  const tabs = ["File", "Home", "Insert", "Draw", "Page Layout", "Formulas", "Data", "Review", "View", "Help"];
  const cols = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const rows = Array.from({ length: 30 }, (_, i) => i + 1);
  const data: Record<string, string> = { A1: "Month", B1: "Income", C1: "Expenses", D1: "Savings",
    A2: "January", B2: "1200", C2: "950", D2: "250", A3: "February", B3: "1200", C3: "880", D3: "320", A4: "March", B4: "1350", C4: "1010", D4: "340", A5: "April", B5: "1200", C5: "1120", D5: "80" };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#fff", fontFamily: sys, display: "flex", flexDirection: "column", color: "#201f1e" }}>
      <div style={{ background: "#217346", color: "#fff", height: 34, display: "flex", alignItems: "center", padding: "0 10px", gap: 10, fontSize: 12.5 }}>
        <button type="button" onClick={onExit} aria-label="menu" title=" " style={{ width: 20, height: 20, borderRadius: 3, border: "none", background: "#fff", color: "#217346", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "grid", placeItems: "center" }}>X</button>
        <span style={{ flex: 1, textAlign: "center" }}>Book1 - Excel</span>
        <span style={{ display: "flex", gap: 16, opacity: 0.9 }}><span>—</span><span>▢</span><span>✕</span></span>
      </div>
      <div style={{ background: "#fff", borderBottom: "1px solid #edebe9", display: "flex", alignItems: "center", gap: 2, padding: "0 10px", height: 32, fontSize: 13 }}>
        {tabs.map((t) => <span key={t} style={{ padding: "6px 9px", color: t === "File" ? "#fff" : "#444", background: t === "File" ? "#217346" : "transparent", borderBottom: t === "Home" ? "2px solid #217346" : "2px solid transparent", fontWeight: t === "Home" ? 600 : 400, borderRadius: t === "File" ? 2 : 0 }}>{t}</span>)}
      </div>
      {/* name box + formula bar */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #e1dfdd", fontSize: 13, color: "#333" }}>
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
                {cols.map((c) => {
                  const v = data[`${c}${r}`] || "";
                  const head = r === 1;
                  const num = ["B", "C", "D"].includes(c) && !head && v;
                  return <td key={c} style={{ border: "1px solid #e4e4e4", height: 22, padding: "0 6px", background: head ? "#e7f0ea" : "#fff", fontWeight: head ? 700 : 400, textAlign: num ? "right" : "left" }}>{num ? `$${v}` : v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* sheet tabs + status */}
      <div style={{ borderTop: "1px solid #e1dfdd", display: "flex", alignItems: "center", fontSize: 12, color: "#444", padding: "3px 10px", gap: 10 }}>
        <span style={{ borderBottom: "2px solid #217346", fontWeight: 700, padding: "2px 10px" }}>Sheet1</span><span style={{ color: "#999" }}>+</span>
        <span style={{ marginLeft: "auto", color: "#555" }}>Ready</span><span style={{ color: "#555" }}>100%</span>
      </div>
    </div>
  );
}

// ---- W3Schools ----------------------------------------------------------------
function W3Schools({ onExit }: { onExit: () => void }) {
  const left = ["HTML HOME", "HTML Introduction", "HTML Editors", "HTML Basic", "HTML Elements", "HTML Attributes", "HTML Headings", "HTML Paragraphs", "HTML Styles", "HTML Formatting", "HTML Links", "HTML Images", "HTML Tables", "HTML Lists"];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#fff", fontFamily: "Verdana, 'Segoe UI', sans-serif", display: "flex", flexDirection: "column", color: "#000", overflow: "hidden" }}>
      {/* top nav */}
      <div style={{ background: "#282a35", color: "#fff", height: 46, display: "flex", alignItems: "center", padding: "0 16px", gap: 20, fontSize: 14, flex: "none" }}>
        <button type="button" onClick={onExit} aria-label="home" title=" " style={{ border: "none", background: "transparent", color: "#fff", fontSize: 19, fontWeight: 700, cursor: "pointer", letterSpacing: "-.5px" }}>
          <span style={{ color: "#04AA6D" }}>W3</span>schools<span style={{ color: "#04AA6D" }}>.</span>com
        </button>
        <span style={{ opacity: 0.85 }}>Tutorials ▾</span><span style={{ opacity: 0.85 }}>Exercises ▾</span><span style={{ opacity: 0.85 }}>Certificates ▾</span><span style={{ opacity: 0.85 }}>Services ▾</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ background: "#fff", color: "#000", borderRadius: 4, padding: "5px 10px", fontSize: 12.5, width: 150 }}>🔍 Search our tuto…</span>
          <span style={{ background: "#04AA6D", color: "#fff", borderRadius: 4, padding: "6px 14px", fontWeight: 700 }}>Sign Up</span>
          <span style={{ background: "#fff", color: "#000", borderRadius: 4, padding: "6px 14px", fontWeight: 700 }}>Log in</span>
        </span>
      </div>
      {/* green sub bar */}
      <div style={{ background: "#04AA6D", color: "#fff", height: 38, display: "flex", alignItems: "center", padding: "0 16px", gap: 22, fontSize: 13.5, flex: "none" }}>
        <span>❮ HTML Introduction</span><span style={{ marginLeft: "auto" }}>HTML Editors ❯</span>
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* left menu */}
        <div style={{ width: 220, background: "#f1f1f1", overflow: "auto", flex: "none" }}>
          {left.map((l, i) => (
            <div key={l} style={{ padding: "9px 16px", fontSize: 13.5, borderBottom: "1px solid #ddd", background: i === 1 ? "#04AA6D" : "transparent", color: i === 1 ? "#fff" : "#000", fontWeight: i === 1 ? 700 : 400 }}>{l}</div>
          ))}
        </div>
        {/* content */}
        <div style={{ flex: 1, overflow: "auto", padding: "22px 32px", maxWidth: 820 }}>
          <h1 style={{ fontSize: 34, margin: "0 0 6px", fontWeight: 400 }}>HTML Introduction</h1>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#04AA6D", fontWeight: 700, margin: "14px 0" }}>
            <span style={{ background: "#f1f1f1", color: "#000", padding: "8px 16px", borderRadius: 4 }}>❮ Previous</span>
            <span style={{ background: "#04AA6D", color: "#fff", padding: "8px 16px", borderRadius: 4 }}>Next ❯</span>
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.6 }}>HTML is the standard markup language for creating Web pages.</p>
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
function ReadingPlus({ onExit }: { onExit: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#eef2f6", fontFamily: sys, display: "flex", flexDirection: "column", color: "#22313f" }}>
      <div style={{ background: "#0b6fb3", color: "#fff", height: 54, display: "flex", alignItems: "center", padding: "0 20px", gap: 16, flex: "none" }}>
        <button type="button" onClick={onExit} aria-label="home" title=" " style={{ border: "none", background: "transparent", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 19, fontWeight: 800 }}>
          <span style={{ width: 28, height: 28, borderRadius: "50%", background: "#fff", color: "#0b6fb3", display: "grid", placeItems: "center", fontSize: 17 }}>R</span>
          Reading<span style={{ fontWeight: 400 }}>Plus</span>
        </button>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 20, fontSize: 14 }}>
          <span style={{ background: "rgba(255,255,255,.2)", padding: "5px 12px", borderRadius: 14 }}>Level J</span>
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
          <h1 style={{ fontSize: 26, margin: "0 0 18px", fontWeight: 700 }}>The Secret Life of Honeybees</h1>
          <p style={{ fontSize: 17, lineHeight: 1.95, margin: "0 0 16px" }}>Inside a single hive, tens of thousands of honeybees work together with remarkable coordination. Each bee has a role, and those roles shift as the bee grows older. Young workers clean cells and care for the developing young, while older bees venture out to gather nectar and pollen.</p>
          <p style={{ fontSize: 17, lineHeight: 1.95, margin: "0 0 16px", color: "#2f4256" }}>When a forager discovers a rich patch of flowers, she returns to the hive and performs a <span style={{ background: "#fff3c4" }}>&ldquo;waggle dance.&rdquo;</span> The direction and length of the dance tell the other bees exactly where to find the food, sometimes miles away.</p>
          <p style={{ fontSize: 17, lineHeight: 1.95, margin: 0, color: "#5a6b7b" }}>This ability to share precise information makes the colony far more efficient than any single bee could ever be on its own&hellip;</p>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 26 }}>
            <span style={{ background: "#0b6fb3", color: "#fff", padding: "11px 30px", borderRadius: 24, fontWeight: 700, fontSize: 15 }}>Continue ❯</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Decoy({ skin, onExit }: { skin: string; onExit: () => void }) {
  // Esc always lifts the cover, so you can never get stuck behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onExit(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  if (skin === "word") return <Word onExit={onExit} />;
  if (skin === "excel") return <Excel onExit={onExit} />;
  if (skin === "w3schools") return <W3Schools onExit={onExit} />;
  if (skin === "readingplus") return <ReadingPlus onExit={onExit} />;
  // "blank" (and any unknown) → a plain innocuous white screen
  return <div onClick={onExit} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#ffffff", cursor: "pointer" }} aria-hidden />;
}
