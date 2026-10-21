"use client";

import type { TitleLanguage } from "@/lib/titles";

export function TitleLanguageToggle({ current }: { current: TitleLanguage }) {
  const next = current === "en" ? "jp" : "en";
  return (
    <button
      type="button"
      onClick={() => {
        document.cookie = `title_lang=${next}; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
      }}
      aria-label={current === "en" ? "Show titles in Japanese (romaji)" : "Show titles in English"}
      className="rounded-md border border-line px-2 py-1 text-xs font-semibold"
    >
      <span className={current === "en" ? "text-accent" : "text-muted"}>EN</span>
      <span className="text-muted"> / </span>
      <span className={current === "jp" ? "text-accent" : "text-muted"}>JP</span>
    </button>
  );
}
