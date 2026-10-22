// Worker build: wreq-js is a native TLS-fingerprinting HTTP client that can't
// run on Cloudflare Workers, so wreqFetch falls back to the platform's global
// fetch. Providers that depend on TLS impersonation to beat anti-bot (senshi,
// anipm, mkissa) may therefore be blocked by some origins; they already handle
// that by erroring out, and the aggregator returns whatever other providers
// succeed. See README "External providers with Anivexa".

export async function wreqFetch(url, options = {}) {
  const { session, browser, os, warm, ...request } = options;
  void session; void browser; void os; void warm;
  return fetch(url, request);
}

export async function closeWreqSessions() {
  // No persistent sessions in the Worker build.
}
