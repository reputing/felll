// Thin Worker that fronts the Moviebox-API container. Every request is forwarded
// to the FastAPI server running inside the container on port 8000.
import { Container, getContainer } from "@cloudflare/containers";

export class MovieboxContainer extends Container {
  constructor(ctx, env) {
    super(ctx, env);
    // The port main.py (uvicorn) listens on inside the container.
    this.defaultPort = 8000;
    // Stay warm so the SQLite catalog + guest tokens survive between visits and
    // the 2-3 min catalog walk isn't re-run on every cold start.
    this.sleepAfter = "2h";
  }
}

export default {
  async fetch(request, env) {
    return getContainer(env.MOVIEBOX_CONTAINER).fetch(request);
  },
};
