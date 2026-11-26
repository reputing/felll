# Streaming providers: what is verified and what is not

Checked 13 Nov 2026 from a datacenter test machine. Observations of public clients and short tests, not contracts with these services.

Evidence levels (a listed link, a loaded frame and playing video are three different things):

| Level | Meaning |
|---|---|
| **Playback verified** | decoded video size, ready state and an advancing clock were observed, under the sandbox the app actually uses |
| **HTTP verified** | the request returned the described status and JSON shape. Says nothing about video |
| **Client configuration** | a URL or provider name read from someone else's public code. May be dormant |
| **Unresolved / not integrated** | blocked by a challenge, needs a protection to be defeated, or failed under the sandbox |

## In the app

| Source | Where | Evidence | Sandbox | Ads |
|---|---|---|---|---|
| **CineSrc ("Zeus")** | movies and series (`lib/movie-servers.ts`, `components/movies/player.tsx`) | Playback verified (31 of 32 sampled titles played, one at a time, median 7 s) | `allow-scripts allow-same-origin` | Popups and redirects blocked by the sandbox. Its own docs say "minimal ads"; no zero-ad mode exists |
| **Flixcloud via Reanime's resolver** | anime watch page, collapsed "More servers (beta)" (`lib/flixcloud.ts`, `app/api/anime-flix`, `components/watch/flix-servers.tsx`) | Resolver: **HTTP verified** (5 rows for AniList 206401 episode 7, matching the supplied report and `cloudflare/anime.mjs`). Playback: **plays sometimes**. With the supplied prototype's player options (`autoPlay=true&skI=false&skO=false`) the video decoded at 1920x1080 with the clock advancing under the sandbox in about 3 of 10 tries from our datacenter test machine; without those options it never played (0 of 5). The player's stream request (`/api/m3u8/...`) otherwise answers 410 Gone, most often on repeated requests from one connection | `allow-scripts allow-same-origin` | **Not ad-free.** The player loads third-party scripts inside its frame (`llvpn.com/tag.min.js`, `my.rtmark.net/gid.js`, an ad-network ping to `luugy.com`) plus Cloudflare analytics. In the samples there was no popup, redirect or blocked attempt after 7 clicks and no visible ad, but that does not show there are none. Popups and page redirects are blocked by the sandbox; scripts inside the frame are not |

Flixcloud is opt-in only: collapsed until a viewer opens it, labelled as beta, never a default and never an automatic fallback. The 410s look like throttling of one connection, so viewers on their own connections may see it start more often; that still has to be checked from a normal connection.

Rules for anything embedded: never relax the sandbox because a server shows an error; the frame-src allowlist (`next.config.ts`) names the only origins a frame may load; the embed URL is rebuilt by us from a validated id and version, never copied from an upstream response.

## Not integrated, and why

| Source | Reason |
|---|---|
| AdRock native player | Read in the supplied ZIP (`dist/adrock.js`): it holds an AES key taken from AdRock's own site code and uses it to decrypt the provider's encrypted stream URLs, then plays the raw CDN links (and ships a captured one, `native-sample.js`). That is removing the provider's protection layer to hotlink streams |
| Cinejoy | The resolver is a protected transport (WebAssembly plus an encoded POST). No plain API was established |
| Koddo | Session and challenge-gated native pipeline (Turnstile player gate) |
| 1Shows | Provider list answers a Cloudflare challenge |
| HydraHD | The documented loader returns 404 |
| SweetFox / VidQueen | Refuses to play under the sandbox |
| 7reels templates (VidEasy, VidFast, AdRock/vidrock, VidSrc, VidLink, VidBolt, VidNest, Vidzee) | Under the strict sandbox seven of eight display an explicit rejection and the eighth showed no video (the report's own test). Several load unsandboxed popups |
| Vidcore | Displays "Please Disable Sandbox". Keep disabled |
| Vidnest "Lamda" native route (`/ophim/`) | Evaluated, not built. See "Lamda / Vidnest evaluation" below |

None of these should be turned on by loosening the sandbox.

## Lamda / Vidnest evaluation (long-tail ZIP, read 13 Nov 2026)

Source: the supplied `long-tail/` packet (`resolve-targets.mjs`, `lab-server.mjs`, `check-resolver.mjs`, coverage and playback JSON, survey). I read all of it and did **not** run the resolver or the relay, so every number below is the packet's own and **has not been reproduced by me**.

### What the packet claims, by evidence level

| Claim | Level | Notes |
|---|---|---|
| Regal Academy S1E1 (TMDB 68737) and Ever After High S1E1 (61775) decoded 1920x1080 with an advancing clock | Playback verified **by the packet's author**, S1E1 only, 2 titles | Not repeated by me. No other episode was tried, so "multiple episodes" is untested in the packet |
| Lamda resolver answers 200 with one stream for both series | HTTP verified (packet) | A returned link is not playback |
| 31 coverage calls: 4 with streams, 22 HTTP 502, 5 timeouts | HTTP verified (packet) | Only Lamda's two episodes then played; Alfa's two URLs failed with 502 |
| Ever After High films | **Not working** | 5 of 7 resolver answers had links, every manifest then returned 502; 2 resolver calls were 502 themselves. Do not advertise films |
| Twelve other Vidnest backends | Client configuration | Registry only; no playback beyond Lamda |

### Three separate questions

1. **Response encoding.** The `{v:2,n,d}` envelope is AES-GCM with key = SHA-256(`n` + "|" + a salt constant shipped in Vidnest's public client). `n` is in the same response, so anyone who can read the client can read the data. It is an obfuscated wire format, not access control, and the packet shows no account, token or challenge involved. I agree with that reading.
2. **Authentication or access restriction.** Found in the packet: none on the resolver (anonymous GET). The media URLs are provider-issued, signed and expiring, handed to any anonymous caller; the lab relay fetches them with no cookies or credentials and gets a playlist. The packet does say upstream cookies and signed URLs were captured and left out of the ZIP, but its own relay does not need them. Nothing here is a login or paywall.
3. **CORS.** The media host sends no `Access-Control-Allow-Origin`, so a page cannot read it from browser JavaScript. That is a browser policy, not proof of an authentication barrier: a plain server-side fetch gets the playlist. It does mean a browser player can only work through a relay that adds the header.

### What was not built, and why (my decision, not a technical block)

- **The media relay and the resolver that exists only to feed it.** Without a relay the stream cannot play in a browser (point 3), so the resolver alone is useless. The relay would carry the video bytes of titles from an unlicensed aggregator through our own servers. The packet itself records a rights holder actively enforcing the same titles (the official S1E1 upload was blocked by a Paramount claim), and a relay makes us the party serving the copies, which is different from embedding another site's own player in a sandboxed frame like CineSrc and Flixcloud. Decoding the envelope is not what stopped this.
- The relay in `lab-server.mjs` is also not close to production shape: no per-client limits, 8 MB buffer per request, no range support, `Access-Control-Allow-Origin: *`, and the playlist rewriter registers any URL on the allowed hosts. A real one would need all of that, which is more reason it is not a drive-by addition.
- Films stay unsupported because their manifests return 502.

Kept as is: CineSrc primary, Flixcloud opt-in, sandbox never relaxed, no unverified candidate enabled.
