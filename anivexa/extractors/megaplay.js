// Worker build: the MegaPlay extractor decodes the player's obfuscated script
// with node:vm, which isn't available on Cloudflare Workers, so it is disabled
// here. canExtractMegaPlay returns false so callers skip it; the detail helpers
// return null. Providers that rely only on MegaPlay (e.g. some Anikoto embeds)
// will fall through to an error, which the aggregator reports per provider.
// See README "External providers with Anivexa".

export function canExtractMegaPlay() {
  return false;
}

export async function extractMegaPlayDetails() {
  return null;
}

export async function extractMegaPlay() {
  return null;
}
