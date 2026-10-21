import { cookies } from "next/headers";

export type TitleLanguage = "en" | "jp";

export const TITLE_LANGUAGE_COOKIE = "title_lang";

export async function getTitleLanguage(): Promise<TitleLanguage> {
  const value = (await cookies()).get(TITLE_LANGUAGE_COOKIE)?.value;
  return value === "jp" ? "jp" : "en";
}

/** English title when preferred and available, otherwise romaji. */
export function displayTitle(
  anime: { title_english: string | null; title_romaji: string },
  lang: TitleLanguage,
): string {
  return lang === "en" ? anime.title_english || anime.title_romaji : anime.title_romaji;
}
