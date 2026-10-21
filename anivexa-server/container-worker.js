// Thin Worker that fronts the Anivexa container. Every request is forwarded to
// the Node server (server.js) running inside the container on port 4000.
import { Container, getContainer } from "@cloudflare/containers";

export class AnivexaContainer extends Container {
  // The port server.js listens on inside the container.
  defaultPort = 4000;
  // Keep a warm instance for 20 min after the last request, then scale to zero.
  sleepAfter = "20m";
}

export default {
  async fetch(request, env) {
    // Single shared instance is plenty for a resolve-only API; getContainer
    // routes every request to the same warm container.
    return getContainer(env.ANIVEXA_CONTAINER).fetch(request);
  },
};
