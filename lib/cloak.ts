// The "cloak": decoy screen and its content, tab disguise, boss key and anti-flip. They are chosen on the hidden /shh page and
// used on every page of the site. They live in localStorage (so they work signed out and with no round trip) and are mirrored to
// the member's account, so they follow the member to a new phone or browser and survive clearing site data. The copy with the
// newer `at` wins, so an old device cannot overwrite a newer choice.
import type { DecoyConfig } from "@/components/shh/decoy";
import { SHH_PREFS_KEY } from "@/lib/tab-mask";

export interface CloakPrefs {
  hideFooter: boolean; hideHeader: boolean; bossKey: boolean; bossKeys: string[]; disguise: string; customTitle: string;
  decoy: string; decoyConfig: DecoyConfig; antiFlip: boolean; antiFlipTarget: string; antiFlipCustom: string; at?: number;
}

export function readLocal(): CloakPrefs | null {
  try { const raw = localStorage.getItem(SHH_PREFS_KEY); return raw ? (JSON.parse(raw) as CloakPrefs) : null; } catch { return null; }
}
export function writeLocal(p: CloakPrefs) { try { localStorage.setItem(SHH_PREFS_KEY, JSON.stringify(p)); } catch { /* storage off */ } }

let timer: ReturnType<typeof setTimeout> | undefined;
/** Mirror a choice to the account (debounced: the decoy text boxes save as you type). Signed out, it quietly does nothing. */
export function pushCloak(p: CloakPrefs) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    fetch("/api/cloak", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefs: p }), keepalive: true }).catch(() => {});
  }, 700);
}

/** Reconcile this device with the account. Returns the prefs to use when the account's copy is newer, else null (nothing changed). */
export async function syncCloak(): Promise<CloakPrefs | null> {
  let server: CloakPrefs | null = null;
  try {
    const r = await fetch("/api/cloak", { cache: "no-store" });
    if (!r.ok) return null; // signed out: this device's copy stands
    server = ((await r.json()) as { prefs: CloakPrefs | null }).prefs;
  } catch { return null; }
  const local = readLocal();
  const sat = server ? (server.at ?? 1) : 0;
  const lat = local ? (local.at ?? 1) : 0;
  if (server && sat > lat) { writeLocal(server); return server; }
  if (local && lat > sat) pushCloak({ ...local, at: local.at ?? Date.now() });
  return null;
}
