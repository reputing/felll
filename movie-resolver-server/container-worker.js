// Fronts the resolver container. Only cupcake calls this, so every request must
// carry the shared key; without it the worker answers 401 and never wakes the
// container.
import { Container, getContainer } from "@cloudflare/containers";

export class MovieResolverContainer extends Container {
  constructor(ctx, env) {
    super(ctx, env);
    this.defaultPort = 8000;
    this.sleepAfter = "10m";
    this.envVars = { RELAY_SECRET: env.RELAY_SECRET || "" };
  }
}

function sameKey(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(request, env) {
    if (!sameKey(request.headers.get("x-resolver-key") || "", env.RESOLVER_KEY || "")) {
      return new Response("unauthorized", { status: 401 });
    }
    return getContainer(env.MOVIE_RESOLVER_CONTAINER).fetch(request);
  },
};
