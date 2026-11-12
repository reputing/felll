// The browser-tab disguises behind /shh: a title and an icon that look like something dull. /shh is the only place they are
// chosen (its settings write them to localStorage "shh:prefs"); the anti-flip component in the root layout reads them from
// there, so one choice there covers the whole site.
export const DISGUISES: Record<string, { title: string; emoji: string }> = {
  docs: { title: "Untitled document - Google Docs", emoji: "📝" },
  sheets: { title: "Untitled spreadsheet - Google Sheets", emoji: "📊" },
  slides: { title: "Untitled presentation - Google Slides", emoji: "📽️" },
  classroom: { title: "Classes", emoji: "🎓" },
  drive: { title: "My Drive - Google Drive", emoji: "📁" },
  mail: { title: "Inbox - Gmail", emoji: "✉️" },
};

export const SHH_PREFS_KEY = "shh:prefs";

// Swap the tab icon for an emoji (null puts the real one back).
export function setFavicon(emoji: string | null) {
  let link = document.querySelector<HTMLLinkElement>("link[data-shh-fav]");
  if (!emoji) { link?.remove(); return; }
  if (!link) { link = document.createElement("link"); link.rel = "icon"; link.setAttribute("data-shh-fav", "1"); document.head.appendChild(link); }
  link.href = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`)}`;
}

// Put a disguise on the tab: one of the presets, or the member's own title.
export function maskTo(target: string, custom: string) {
  if (target === "custom") { if (custom.trim()) document.title = custom.trim(); setFavicon("📄"); }
  else if (DISGUISES[target]) { document.title = DISGUISES[target].title; setFavicon(DISGUISES[target].emoji); }
}

/** The anti-flip choice saved from /shh, read fresh each time (so a change there applies at once, with no reload). */
export function readAntiFlip(): { on: boolean; target: string; custom: string } {
  try {
    const p = JSON.parse(localStorage.getItem(SHH_PREFS_KEY) || "{}") as { antiFlip?: boolean; antiFlipTarget?: string; antiFlipCustom?: string };
    return { on: !!p.antiFlip, target: p.antiFlipTarget || "docs", custom: p.antiFlipCustom || "" };
  } catch { return { on: false, target: "docs", custom: "" }; }
}
