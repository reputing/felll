// Thin Worker that fronts the Consumet manga container. Every request is
// forwarded to the Consumet API (a Fastify server) running inside the container
// on port 3000. Same pattern as anivexa-server/container-worker.js.
import { Container, getContainer } from "@cloudflare/containers";

export class ConsumetContainer extends Container {
  constructor(ctx, env) {
    super(ctx, env);
    // The port the Consumet server listens on inside the container.
    this.defaultPort = 3000;
    // Stay warm for half an hour after the last request, so repeat reads while
    // someone is working through a manga don't pay a cold start.
    this.sleepAfter = "30m";
    this.envVars = {
      NODE_ENV: "PROD",
      PORT: "3000",
    };
  }
}

export default {
  async fetch(request, env) {
    return getContainer(env.CONSUMET_CONTAINER).fetch(request);
  },
};
