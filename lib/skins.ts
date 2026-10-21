export const SKINS = [
  { id: "midnight", label: "Midnight", swatch: ["#09080a", "#ff4f9a"] },
  { id: "cupcake", label: "Cupcake", swatch: ["#fcf0f4", "#e8679a"] },
  { id: "matcha", label: "Matcha", swatch: ["#eef6ef", "#3fae66"] },
  { id: "lilac", label: "Lilac", swatch: ["#f3f0fc", "#8b6be6"] },
] as const;
export type Skin = (typeof SKINS)[number]["id"];
export const isSkin = (s: unknown): s is Skin => SKINS.some((k) => k.id === s);
export const DEFAULT_SKIN: Skin = "midnight";
