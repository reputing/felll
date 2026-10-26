// Client calls for member collections (mixed anime + manga lists). Every call
// parses the JSON body even on a non-2xx so the reason reaches the user.
export interface CollectionCard { id: string; name: string; visibility: string; count: number; covers: string[] }
export interface CollectionItem { kind: "anime" | "manga"; ref_id: string; title: string; cover: string | null; added_at: number }
export interface CollectionFull { id: string; user_id: string; name: string; visibility: string; created_at: number; handle: string; display_name: string; avatar_url: string | null; accent: string }
export interface PickerRow { id: string; name: string; visibility: string; has: number }

/* eslint-disable @typescript-eslint/no-explicit-any */
async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as any).error || "failed");
  return d as T;
}
async function post<T = any>(body: any): Promise<T> {
  const r = await fetch("/api/collections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as any).error || "failed");
  return d as T;
}

export const myCollections = () => get<{ collections: CollectionCard[] }>("/api/collections").then((d) => d.collections);
export const userCollections = (handle: string) => get<{ collections: CollectionCard[] }>(`/api/collections?user=${encodeURIComponent(handle)}`).then((d) => d.collections);
export const getCollection = (id: string) => get<{ collection: CollectionFull; items: CollectionItem[]; mine: boolean }>(`/api/collections?id=${encodeURIComponent(id)}`);
export const pickerFor = (kind: string, ref: string) => get<{ collections: PickerRow[] }>(`/api/collections?picker=${encodeURIComponent(`${kind}:${ref}`)}`).then((d) => d.collections);

export const createCollection = (name: string, visibility = "public") => post<{ id: string }>({ op: "create", name, visibility });
export const renameCollection = (id: string, name: string) => post({ op: "rename", id, name });
export const setCollectionVisibility = (id: string, visibility: string) => post({ op: "visibility", id, visibility });
export const deleteCollection = (id: string) => post({ op: "delete", id });
export const addToCollection = (id: string, kind: "anime" | "manga", refId: string, title: string, cover: string | null) => post({ op: "add", id, kind, refId, title, cover });
export const removeFromCollection = (id: string, kind: "anime" | "manga", refId: string) => post({ op: "remove", id, kind, refId });

export const itemHref = (i: { kind: string; ref_id: string }) => (i.kind === "manga" ? `/manga/${i.ref_id}` : `/anime/${i.ref_id}`);
