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
| **Flixcloud via Reanime's resolver** | anime watch page, collapsed "More servers (beta)" (`lib/flixcloud.ts`, `app/api/anime-flix`, `components/watch/flix-servers.tsx`) | Resolver: **HTTP verified** (5 rows for AniList 206401 episode 7, matching the report). Playback: **not verified**; from our test machine the stream request answered 410 Gone ("Failed to decrypt video URL") for 2 episodes and 3 player versions | `allow-scripts allow-same-origin` | **Not ad-free.** The player loads third-party scripts inside its frame (`llvpn.com/tag.min.js`, `my.rtmark.net/gid.js`, `luugy.com`) plus Cloudflare analytics. Popups and page redirects are blocked; scripts inside the frame are not |

Flixcloud is opt-in only: collapsed until a viewer opens it, labelled as beta, never a default and never an automatic fallback. If the 410 is specific to datacenter connections it may play for real viewers; that has to be checked from a normal connection.

Rules for anything embedded: never relax the sandbox because a server shows an error; the frame-src allowlist (`next.config.ts`) names the only origins a frame may load; the embed URL is rebuilt by us from a validated id and version, never copied from an upstream response.

## Not integrated, and why

| Source | Reason |
|---|---|
| AdRock native player | Depends on decoding the provider's obfuscated URLs and on a captured stream link that expires. That is extracting a stream around the provider's own protection |
| Cinejoy | The resolver is a protected transport (WebAssembly plus an encoded POST). No plain API was established |
| Koddo | Session and challenge-gated native pipeline (Turnstile player gate) |
| 1Shows | Provider list answers a Cloudflare challenge |
| HydraHD | The documented loader returns 404 |
| SweetFox / VidQueen | Refuses to play under the sandbox |
| 7reels templates (VidEasy, VidFast, AdRock/vidrock, VidSrc, VidLink, VidBolt, VidNest, Vidzee) | Under the strict sandbox seven of eight display an explicit rejection and the eighth showed no video (the report's own test). Several load unsandboxed popups |
| Vidcore | Displays "Please Disable Sandbox". Keep disabled |

None of these should be turned on by loosening the sandbox.
