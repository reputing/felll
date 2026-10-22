const __name = (fn, _) => fn;

var resolved = new Map();
var inflight = new Map();
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var ARM = "https://arm.haglund.dev/api/v2/ids";
var ANILIST_WEB = "https://anilist.co";

const AL_STATUS_MAP = {
  RELEASING: "RELEASING",
  FINISHED: "FINISHED",
  NOT_YET_RELEASED: "NOT_YET_RELEASED",
  CANCELLED: "FINISHED",
  HIATUS: "HIATUS",
};

function cookiesFromHeaders(headers) {
  const values = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean);
  return values.map((value) => String(value).split(";")[0]).join("; ");
}

async function mediaFromResponse(res) {
  if (!res?.ok) return null;
  try {
    const json = await res.json();
    return json.data?.Media ?? null;
  } catch {
    return null;
  }
}

async function fetchFromAniListWeb(body) {
  const home = await fetch(`${ANILIST_WEB}/`, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
  }).catch(() => null);
  if (!home?.ok) return null;
  const html = await home.text();
  const token = html.match(/window\.al_token\s*=\s*"([^"]+)"/)?.[1];
  const cookie = cookiesFromHeaders(home.headers);
  if (!token || !cookie) return null;
  const res = await fetch(`${ANILIST_WEB}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": UA,
      Referer: `${ANILIST_WEB}/home`,
      "x-csrf-token": token,
      schema: "default",
      Cookie: cookie,
    },
    body,
  }).catch(() => null);
  return mediaFromResponse(res);
}

async function fetchFromAniList(id) {
  const fullQuery = `query($id:Int){Media(id:$id,type:ANIME){id idMal title{english romaji native} status format episodes seasonYear startDate{year} genres synonyms nextAiringEpisode{episode airingAt timeUntilAiring}}}`;
  const body = JSON.stringify({ query: fullQuery, variables: { id } });
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": UA,
      "Origin": "https://anilist.co",
      "Referer": "https://anilist.co/",
    },
    body,
  }).catch(() => null);
  return await mediaFromResponse(res) ?? fetchFromAniListWeb(body);
}

// Fallback metadata source when AniList GraphQL is blocked/rate-limited (e.g.
// from Cloudflare's network). ani.zip is a different host and gives titles + the
// MAL id, which is enough for the providers to resolve.
async function fetchFromAniZip(id) {
  const res = await fetch(`https://api.ani.zip/mappings?anilist_id=${id}`, {
    headers: { "User-Agent": UA, "Accept": "application/json" },
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  const titles = data?.titles ?? {};
  const english = titles.en ?? titles["en-us"] ?? null;
  const romaji = titles["x-jat"] ?? titles.ja_jp ?? null;
  const native = titles.ja ?? titles["ja-jp"] ?? null;
  const malId = data?.mappings?.mal_id ?? null;
  if (!english && !romaji && !native && !malId) return null;
  return { english, romaji, native, malId, synonyms: Object.values(titles).filter((t) => typeof t === "string") };
}

async function getMedia(anilistId) {
  const id = Number(anilistId);
  if (resolved.has(id)) return resolved.get(id);
  if (inflight.has(id)) return inflight.get(id);
  const promise = (async () => {
    const arm = await fetch(`${ARM}?source=anilist&id=${id}`, {
      headers: { "User-Agent": UA, "Accept": "application/json" }
    }).then((r) => {
      if (!r.ok) return null;
      return r.json();
    }).catch(() => null);

    const al = await fetchFromAniList(id);
    if (!al) {
      // AniList unreachable — build minimal media from ani.zip so providers
      // (which only need title + MAL id) can still resolve.
      const az = await fetchFromAniZip(id);
      if (!az) throw new Error(`No data found for AniList ID ${id}`);
      const media = {
        id,
        idMal: az.malId ?? arm?.myanimelist ?? null,
        title: { english: az.english, romaji: az.romaji, native: az.native },
        status: "RELEASING",
        format: null,
        episodes: null,
        seasonYear: null,
        startDate: null,
        genres: [],
        nextAiringEpisode: null,
        synonyms: Array.isArray(az.synonyms) ? az.synonyms : [],
      };
      resolved.set(id, media);
      inflight.delete(id);
      return media;
    }
    const media = {
      id,
      idMal: al.idMal ?? arm?.myanimelist ?? null,
      title: {
        english: al.title?.english ?? null,
        romaji: al.title?.romaji ?? null,
        native: al.title?.native ?? null,
      },
      status: AL_STATUS_MAP[al.status] ?? "RELEASING",
      format: al.format ?? null,
      episodes: al.episodes ?? null,
      seasonYear: al.seasonYear ?? null,
      startDate: al.startDate ?? null,
      genres: Array.isArray(al.genres) ? al.genres : [],
      nextAiringEpisode: al.nextAiringEpisode ?? null,
      synonyms: Array.isArray(al.synonyms) ? al.synonyms : [],
    };
    resolved.set(id, media);
    inflight.delete(id);
    return media;
  })().catch((e) => {
    inflight.delete(id);
    throw e;
  });
  inflight.set(id, promise);
  return promise;
}
__name(getMedia, "getMedia");

function forgetMedia(anilistId) {
  resolved.delete(Number(anilistId));
}

export { getMedia, forgetMedia };
