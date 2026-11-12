import { useCallback, useEffect, useState } from "react";

// "Auto-skip intro" and "auto-skip outro", one pair of switches for the anime
// player and the movie player so a viewer sets them once. Per-device, in
// localStorage (the same keys the Settings page writes). Off until asked for:
// jumping the picture is not something to do to someone who did not choose it.
export const SKIP_KEYS = { intro: "autoSkip", outro: "autoSkipOutro" } as const;

function read(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}

export function useSkipPrefs() {
  const [intro, setIntroState] = useState(false);
  const [outro, setOutroState] = useState(false);
  useEffect(() => { setIntroState(read(SKIP_KEYS.intro)); setOutroState(read(SKIP_KEYS.outro)); }, []);
  const save = (key: string, v: boolean) => { try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* storage off: it lasts until reload */ } };
  const setIntro = useCallback((v: boolean) => { setIntroState(v); save(SKIP_KEYS.intro, v); }, []);
  const setOutro = useCallback((v: boolean) => { setOutroState(v); save(SKIP_KEYS.outro, v); }, []);
  return { intro, outro, setIntro, setOutro };
}

/**
 * Whether a marker is believable enough to jump on its own. A tap on a "Skip"
 * button is the viewer's call; a jump nobody asked for needs a sanity check, so
 * a stray marker (a crowd typo, a wrong cut) cannot throw someone out of the
 * middle of an episode. Intros sit near the start, credits in the back half.
 */
export function introIsSane(start: number, end: number, duration: number): boolean {
  if (!(end > start) || end - start > 600) return false;
  return !duration || start < duration * 0.4;
}
export function outroIsSane(start: number, duration: number): boolean {
  return start >= 0 && (!duration || start >= duration * 0.5);
}
