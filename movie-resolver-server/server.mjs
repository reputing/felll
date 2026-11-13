// Native resolver for cupcake's movie player. Two providers, both reached only
// at their fixed origins:
//   Lamda  (new.vidnest.fun /ophim/…)  - movies and TV, v2 AES-GCM envelope
//   AdRock (vidrock.net /api/…)        - movies (TV unconfirmed), AES-GCM urls
// Constants below are the public ones their own web clients ship; this decodes
// a response envelope, it does not touch DRM.
//
//   GET /resolve?type=movie|tv&id=<tmdb>&s=&e=  -> { sources:[{label,provider,url,format}] }
//   GET /media?t=<signed token>                  -> the media bytes (playlists rewritten)
//
// Media is only ever fetched from MEDIA_HOSTS, over https, with no redirects and
// no credentials. A token is HMAC-signed and expires, so this is not a
// user-supplied-URL proxy.
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 8000);
const SECRET = process.env.RELAY_SECRET || crypto.randomBytes(32).toString("hex");
const RELAY_PATH = "/api/movie/relay?t="; // cupcake's same-origin route; playlists are rewritten to it

const LAMDA_ORIGIN = "https://new.vidnest.fun";
const LAMDA_SALT = "K3p8vQ2mX9rL5wZ0fN7bG1sH4tJ6dC9_y8S3wM1nQ5pL2";
const LAMDA_HOSTS = ["m5f-cf.money-2.workers.dev", "m5f-cf.money-4.workers.dev", "m5f-cf.money-5.workers.dev", "m5f-cf.money-6.workers.dev", "m5f-cf.money-7.workers.dev", "m5f-cf.money-8.workers.dev"];
const ADROCK_KEY = "7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f";
const ADROCK_HOSTS = ["vercetti.org", "cdn2.slowcloud.live", "cdn.slowcloud.live", "lucidmechanism.site"];
const ADROCK_NAMES = new Set(["Nova", "Atlas", "Astra", "Orion", "Luna", "Lyra", "Hindi", "Tamil", "Telugu"]);
// New hosts fail closed until someone reviews them and adds them here.
const MEDIA_HOSTS = new Set([...LAMDA_HOSTS, ...ADROCK_HOSTS]);

const TOKEN_TTL_MS = 4 * 3600_000;
const MAX_PLAYLIST = 2 * 1024 * 1024;
const MAX_MEDIA = 128 * 1024 * 1024;
const MAX_INFLIGHT = 48;
let inflight = 0;

const pos = (v, label) => { if (!/^[1-9]\d{0,9}$/.test(String(v))) throw new TypeError("bad " + label); return String(v); };
const okMedia = (value) => {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !u.port && MEDIA_HOSTS.has(u.hostname); }
  catch { return false; }
};
const b64u = (b) => Buffer.from(b).toString("base64url");
const mac = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
function mint(url) {
  const body = b64u(JSON.stringify({ u: url, x: Date.now() + TOKEN_TTL_MS }));
  return body + "." + mac(body);
}
function open(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const { u, x } = JSON.parse(Buffer.from(body, "base64url").toString());
    return Date.now() < x && okMedia(u) ? u : null;
  } catch { return null; }
}

async function getJson(url, limit) {
  const r = await fetch(url, { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("upstream " + r.status);
  const text = await r.text();
  if (text.length > limit) throw new Error("oversized");
  return JSON.parse(text);
}
const unb64u = (s) => Buffer.from(s.replaceAll("-", "+").replaceAll("_", "/"), "base64");

async function lamda({ type, id, s, e }) {
  const tail = type === "tv" ? `/${pos(s, "season")}/${pos(e, "episode")}` : "";
  let p = await getJson(`${LAMDA_ORIGIN}/ophim/${type}/${pos(id, "id")}${tail}?_n=${crypto.randomUUID().replaceAll("-", "")}`, 1_048_576);
  if (p?.v === 2 && typeof p.d === "string" && typeof p.n === "string" && p.n.length <= 1024 && p.d.length <= 1_400_000) {
    const key = crypto.createHash("sha256").update(p.n + "|" + LAMDA_SALT).digest();
    const raw = unb64u(p.d);
    const d = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(raw.length - 16));
    p = JSON.parse(Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString());
  }
  return (Array.isArray(p?.streams) ? p.streams : [])
    .filter((x) => x && okMedia(x.url) && ["hls", "mp4"].includes(x.type))
    .map((x) => ({ provider: "Lamda", label: ["Lamda", String(x.language || "").slice(0, 40), String(x.quality || "").slice(0, 12)].filter(Boolean).join(" · "), url: x.url, format: x.type === "mp4" ? "mp4" : "hls", pri: /original|english/i.test(x.language || "") ? 0 : 2 }));
}

async function adrock({ type, id, s, e }) {
  const tail = type === "tv" ? `/${pos(s, "season")}/${pos(e, "episode")}` : "";
  const data = await getJson(`https://vidrock.net/api/${type}/${pos(id, "id")}${tail}`, 262_144);
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const key = Buffer.from(ADROCK_KEY, "hex");
  const out = [], seen = new Set();
  for (const [name, entry] of Object.entries(data).slice(0, 30)) {
    if (!ADROCK_NAMES.has(name) || typeof entry?.url !== "string" || !entry.url || entry.url.length > 16384 || !["hls", "mp4"].includes(entry.type)) continue;
    try {
      const raw = unb64u(entry.url);
      if (raw.length < 29) continue;
      const d = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(raw.length - 16));
      const url = Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString();
      if (!okMedia(url) || seen.has(url)) continue;
      seen.add(url);
      out.push({ provider: "AdRock", label: `${name} · ${String(entry.language || "Original audio").slice(0, 40)}`, url, format: entry.type === "mp4" ? "mp4" : "hls", pri: name === "Orion" ? 1 : 3 });
    } catch { /* corrupt or unsupported entry stays unavailable */ }
  }
  return out;
}

const cache = new Map(); // short cache so a page load plus a retry is one upstream call
async function resolve(q) {
  const k = [q.type, q.id, q.s, q.e].join(":");
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const settled = await Promise.allSettled([lamda(q), adrock(q)]);
  const all = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  all.sort((a, b) => a.pri - b.pri);
  const v = { sources: all.map(({ label, provider, url, format }) => ({ label, provider, format, url: RELAY_PATH + mint(url) })), errors: settled.filter((r) => r.status === "rejected").length };
  if (all.length) { cache.set(k, { at: Date.now(), v }); if (cache.size > 500) cache.delete(cache.keys().next().value); }
  return v;
}

async function relay(req, res, target) {
  if (inflight >= MAX_INFLIGHT) { res.writeHead(503, { "retry-after": "2" }); return res.end("busy"); }
  inflight++;
  try {
    const headers = {};
    if (req.headers.range) headers.range = req.headers.range;
    const up = await fetch(target, { headers, redirect: "error", signal: AbortSignal.timeout(30000) });
    if (!up.ok && up.status !== 206) { res.writeHead(up.status === 404 ? 404 : 502); return res.end("upstream " + up.status); }
    const len = Number(up.headers.get("content-length") || 0);
    if (len > MAX_MEDIA) { res.writeHead(502); return res.end("too large"); }
    const ct = up.headers.get("content-type") || "";
    const isList = /mpegurl/i.test(ct) || /\.m3u8(\?|$)/i.test(target);
    if (isList) {
      const text = await up.text();
      if (text.length > MAX_PLAYLIST) { res.writeHead(502); return res.end("too large"); }
      if (!text.startsWith("#EXTM3U")) { res.writeHead(502); return res.end("not a playlist"); }
      const wrap = (u) => { const abs = new URL(u, target).href; if (!okMedia(abs)) throw new Error("host not allowed"); return RELAY_PATH + mint(abs); };
      const body = text.split("\n").map((line) => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith("#")) return line.replace(/URI="([^"\r\n]+)"/g, (_, u) => `URI="${wrap(u)}"`);
        return wrap(t);
      }).join("\n");
      res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      return res.end(body);
    }
    const out = { "content-type": ct || "application/octet-stream", "cache-control": "no-store", "x-content-type-options": "nosniff" };
    for (const h of ["content-length", "content-range", "accept-ranges"]) { const v = up.headers.get(h); if (v) out[h] = v; }
    res.writeHead(up.status, out);
    if (!up.body) return res.end();
    let sent = 0;
    for await (const chunk of up.body) { sent += chunk.length; if (sent > MAX_MEDIA) break; if (!res.write(chunk)) await new Promise((r) => res.once("drain", r)); }
    res.end();
  } catch (e) {
    if (!res.headersSent) res.writeHead(502);
    res.end(String(e.message || e).slice(0, 120));
  } finally { inflight--; }
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  try {
    if (u.pathname === "/resolve") {
      const type = u.searchParams.get("type");
      if (type !== "movie" && type !== "tv") { res.writeHead(400); return res.end("bad type"); }
      const q = { type, id: u.searchParams.get("id"), s: u.searchParams.get("s") || 1, e: u.searchParams.get("e") || 1 };
      pos(q.id, "id"); pos(q.s, "season"); pos(q.e, "episode");
      const v = await resolve(q);
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify(v));
    }
    if (u.pathname === "/media") {
      const target = open(u.searchParams.get("t"));
      if (!target) { res.writeHead(403); return res.end("bad token"); }
      return relay(req, res, target);
    }
    if (u.pathname === "/") { res.writeHead(200); return res.end("ok"); }
    res.writeHead(404); res.end();
  } catch (e) {
    res.writeHead(e instanceof TypeError ? 400 : 502); res.end(String(e.message || e).slice(0, 120));
  }
}).listen(PORT, "0.0.0.0");
