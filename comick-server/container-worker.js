// Thin Worker fronting the comick-source-api container
// (github.com/GooglyBlox/comick-source-api), a Next.js manga scraper that runs
// server-side (so it can get past protections a plain Worker can't). Forwards to
// `next start` inside the container on port 3000.
import { Container, getContainer } from "@cloudflare/containers";

export class ComickContainer extends Container {
  constructor(ctx, env) {
    super(ctx, env);
    this.defaultPort = 3000;
    this.sleepAfter = "30m";
    this.envVars = { NODE_ENV: "production", PORT: "3000" };
  }
}

export default {
  async fetch(request, env) {
    return getContainer(env.COMICK_CONTAINER).fetch(request);
  },
};
