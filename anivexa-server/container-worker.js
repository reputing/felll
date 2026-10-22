// Thin Worker that fronts the Anivexa container. Every request is forwarded to
// the Node server (server.js) running inside the container on port 4000.
import { Container, getContainer } from "@cloudflare/containers";

export class AnivexaContainer extends Container {
  constructor(ctx, env) {
    super(ctx, env);
    // The port server.js listens on inside the container.
    this.defaultPort = 4000;
    // Stay warm for an hour after the last request so the in-memory cache
    // survives between visits and there are no cold starts during active use.
    this.sleepAfter = "1h";
    // Pass caching config into the container. CACHE_ENABLED turns on the
    // in-memory cache; add the UPSTASH_* values (as wrangler secrets) for a
    // shared cache that survives restarts.
    this.envVars = {
      CACHE_ENABLED: env.CACHE_ENABLED ?? "true",
      DEFAULT_REDIS_TTL: env.DEFAULT_REDIS_TTL ?? "900",
      UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL ?? "",
      UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN ?? "",
    };
  }
}

export default {
  async fetch(request, env) {
    return getContainer(env.ANIVEXA_CONTAINER).fetch(request);
  },
};
