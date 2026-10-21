"use client";
import { useMemo } from "react";
import type { Anime } from "./jikan";
import { useBox } from "./store";

export function useCatalog(pool: Anime[]) {
  const q = useBox((s) => s.q), fmt = useBox((s) => s.fmt), genres = useBox((s) => s.genres);
  const sort = useBox((s) => s.sort), savedOnly = useBox((s) => s.savedOnly), lib = useBox((s) => s.lib), sel = useBox((s) => s.sel);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out = pool.filter((m) =>
      (fmt === "all" || m.group === fmt) &&
      genres.every((g) => m.genres.includes(g) || m.themes.includes(g)) &&
      (!savedOnly || lib[m.id]?.status) &&
      (!ql || `${m.title} ${m.romaji} ${m.native} ${m.studio}`.toLowerCase().includes(ql)));
    if (sort === "score") out.sort((a, b) => b.scoreN - a.scoreN);
    if (sort === "members") out.sort((a, b) => b.members - a.members);
    if (sort === "az") out.sort((a, b) => a.title.localeCompare(b.title));
    return out;
  }, [pool, q, fmt, genres, sort, savedOnly, lib]);

  const selected = pool.find((m) => m.id === sel) ?? list[0] ?? pool[0];
  return { list, selected };
}
