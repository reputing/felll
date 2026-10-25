// Thin Worker fronting the mangareader-api container
// (github.com/stabldev/mangareader-api), a FastAPI scraper of mangareader.to.
// Forwards to the server inside the container on port 3000.
//
// NOTE: this API exposes search / manga-detail / chapter-LIST but NO page-image
// endpoint, so it can't serve a reader on its own. Consumet already scrapes
// mangareader.to WITH pages, so the frontend uses Consumet for that site and
// does not wire this one. It's here because you asked for every server to be
// deployable on Cloudflare Containers.
import { Container, getContainer } from "@cloudflare/containers";

export class MangaReaderContainer extends Container {
  constructor(ctx, env) {
    super(ctx, env);
    this.defaultPort = 3000;
    this.sleepAfter = "30m";
  }
}

export default {
  async fetch(request, env) {
    return getContainer(env.MANGAREADER_CONTAINER).fetch(request);
  },
};
