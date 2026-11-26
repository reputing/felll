// Cast and crew from open data, with no key: IMDb's suggestion box finds a person and a photo, Wikipedia gives the bio,
// and Wikidata lists the films they are credited in (each with its IMDb id, so every title links straight to its page here).
// Everything is cached in D1 for a long time (people do not change), and every call soft-fails to nothing.
import { cached } from "./movie-cache";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

const UA = { "user-agent": "cupcake.gg/1.0 (+https://cupcake.gg)", accept: "application/json" };
const DAY = 86400;

export interface Person { id: string; name: string; photo: string | null; known: string | null }
export interface Credit { imdb: string; title: string; year: number | null }
export interface PersonPage extends Person { bio: string | null; description: string | null; wikipedia: string | null; credits: Credit[] }

const slugKey = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

async function json(url: string, timeout = 8000, init: RequestInit = {}): Promise<Raw | null> {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout), ...init });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** Find a person by name: IMDb id, photo, and what they are known for. A name that finds nobody is remembered too (as long
 *  as a hit is), so a made-up name cannot make us ask IMDb again on every request. */
export async function personByName(name: string): Promise<Person | null> {
  const key = slugKey(name);
  if (!key || key.length > 60) return null;
  const hit = await cached<Person>(`person:find:${key}`, async () => {
    const d = await json(`https://v3.sg.media-imdb.com/suggestion/${key[0]}/${encodeURIComponent(key)}.json`, 6000);
    if (!d) return null; // the lookup itself failed: do not remember that as "nobody"
    const hits: Raw[] = (d?.d ?? []).filter((x: Raw) => String(x.id).startsWith("nm"));
    const found = hits.find((x) => slugKey(String(x.l)) === key) ?? null;
    return found ? { id: found.id, name: String(found.l), photo: found.i?.imageUrl ?? null, known: found.s ? String(found.s) : null } : { id: "", name, photo: null, known: null };
  }, 60 * DAY);
  return hit && hit.id ? hit : null;
}

/** Photos for a title's cast, in order. Anyone not found is returned without a photo. */
export async function castWithPhotos(names: string[]): Promise<{ name: string; photo: string | null; known: string | null }[]> {
  const out = await Promise.all(names.slice(0, 16).map(async (n) => {
    const p = await personByName(n).catch(() => null);
    return { name: n, photo: p?.photo ?? null, known: p?.known ?? null };
  }));
  return out;
}

async function sparql(q: string): Promise<Raw[] | null> {
  const d = await json(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, 14000);
  return d?.results?.bindings ?? null;
}

/** A person's page: bio, a bigger picture, and their credits. */
export async function personPage(name: string): Promise<PersonPage | null> {
  const base = await personByName(name);
  if (!base) return null;
  return cached<PersonPage>(`person:page:${base.id}`, async () => {
    const [ent, films] = await Promise.all([
      sparql(`SELECT ?p ?desc ?wp ?img WHERE { ?p wdt:P345 "${base.id}". OPTIONAL { ?p schema:description ?desc FILTER(LANG(?desc)="en") } OPTIONAL { ?wp schema:about ?p; schema:isPartOf <https://en.wikipedia.org/> } OPTIONAL { ?p wdt:P18 ?img } } LIMIT 1`),
      sparql(`SELECT DISTINCT ?imdb ?filmLabel ?date WHERE { ?p wdt:P345 "${base.id}". { ?film wdt:P161 ?p } UNION { ?film wdt:P57 ?p } ?film wdt:P345 ?imdb. FILTER(STRSTARTS(?imdb,"tt")) OPTIONAL { ?film wdt:P577 ?date } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY DESC(?date) LIMIT 120`),
    ]);
    const e = ent?.[0];
    const wp = e?.wp?.value ? String(e.wp.value) : null;
    const title = wp ? decodeURIComponent(wp.split("/wiki/")[1] ?? "") : "";
    const sum = title ? await json(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, 7000) : null;
    const seen = new Set<string>();
    const credits: Credit[] = (films ?? [])
      .map((r: Raw) => ({ imdb: String(r.imdb?.value ?? ""), title: String(r.filmLabel?.value ?? ""), year: Number(String(r.date?.value ?? "").slice(0, 4)) || null }))
      // a film with no English label comes back as its Wikidata id (Q123): not something to show
      .filter((c: Credit) => /^tt\d{5,10}$/.test(c.imdb) && c.title && !/^Q\d+$/.test(c.title) && !seen.has(c.imdb) && !!seen.add(c.imdb));
    const photo = sum?.originalimage?.source || sum?.thumbnail?.source || base.photo;
    if (!sum && !credits.length && !e) return null;
    return { ...base, photo, bio: sum?.extract ? String(sum.extract) : null, description: e?.desc?.value ?? sum?.description ?? null, wikipedia: sum?.content_urls?.desktop?.page ?? wp, credits };
  }, 14 * DAY);
}
