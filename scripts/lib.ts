import { createHash } from "node:crypto";

// Scripts read .env.local / .env like Next.js does; variables already set in
// the environment (e.g. GitHub Actions secrets) win.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // File absent.
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * "<title>-<6 chars>". The suffix is derived from the AniList id so the slug
 * stays the same on every re-sync, and titles that slugify identically
 * (remakes, seasons) still get distinct URLs.
 */
export function animeSlug(title: string, anilistId: number): string {
  const suffix = BigInt("0x" + createHash("sha1").update(`anilist:${anilistId}`).digest("hex").slice(0, 12))
    .toString(36)
    .slice(0, 6)
    .padStart(6, "0");
  return `${slugify(title) || "anime"}-${suffix}`;
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

export const flag = (name: string) => process.argv.includes(`--${name}`);
