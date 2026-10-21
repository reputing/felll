const FORMAT_LABELS: Record<string, string> = {
  TV: "TV",
  TV_SHORT: "TV Short",
  MOVIE: "Movie",
  SPECIAL: "Special",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Music",
};

const STATUS_LABELS: Record<string, string> = {
  FINISHED: "Finished",
  RELEASING: "Releasing",
  NOT_YET_RELEASED: "Not Yet Released",
  CANCELLED: "Cancelled",
  HIATUS: "Hiatus",
};

export const formatLabel = (f: string | null) => (f ? FORMAT_LABELS[f] ?? f : "");
export const statusLabel = (s: string | null) => (s ? STATUS_LABELS[s] ?? s : "");

export function durationLabel(minutes: number | null): string {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes}m`;
  const m = minutes % 60;
  return m ? `${Math.floor(minutes / 60)}h ${m}m` : `${minutes / 60}h`;
}

/** AniList scores are 0–100; show them on a 10-point scale. */
export const scoreLabel = (score: number | null) => (score == null ? "" : (score / 10).toFixed(1));
