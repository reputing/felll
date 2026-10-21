// Signs Cloudflare Stream playback tokens locally (RS256 JWT) so each play
// does not cost a Stream API call. See README "Cloudflare Stream setup".

const encoder = new TextEncoder();

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? encoder.encode(input) : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let signingKey: Promise<CryptoKey> | undefined;

function getSigningKey(): Promise<CryptoKey> {
  const jwk = process.env.STREAM_SIGNING_KEY_JWK;
  if (!jwk) throw new Error("STREAM_SIGNING_KEY_JWK is not set");
  signingKey ??= crypto.subtle.importKey(
    "jwk",
    JSON.parse(atob(jwk)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return signingKey;
}

/** Returns an HLS manifest URL for a Stream video that expires after ttl seconds. */
export async function signedStreamUrl(uid: string, ttlSeconds = 4 * 60 * 60): Promise<string> {
  const keyId = process.env.STREAM_SIGNING_KEY_ID;
  const domain = process.env.STREAM_CUSTOMER_DOMAIN;
  if (!keyId || !domain) throw new Error("STREAM_SIGNING_KEY_ID and STREAM_CUSTOMER_DOMAIN must be set");

  const header = base64url(JSON.stringify({ alg: "RS256", kid: keyId }));
  const payload = base64url(
    JSON.stringify({ sub: uid, kid: keyId, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await getSigningKey(),
    encoder.encode(`${header}.${payload}`),
  );
  const token = `${header}.${payload}.${base64url(signature)}`;
  return `https://${domain}/${token}/manifest/video.m3u8`;
}
