// Thin Worker fronting the manga-api container
// (github.com/febryardiansyah/manga-api), an Indonesian-language manga API.
// Forwards to the Node server inside the container on port 3000.
//
// NOTE: this serves Indonesian manga. The frontend does NOT wire it by default;
// it's here so you can deploy it if you want Indonesian sources later.
import { Container, getContainer } from "@cloudflare/containers";

export class MangaIdContainer extends Container {
  constructor(ctx, env) {
    super(ctx, env);
    this.defaultPort = 3000;
    this.sleepAfter = "30m";
    this.envVars = { MODE: "PRODUCTION", PORT: "3000" };
  }
}

export default {
  async fetch(request, env) {
    return getContainer(env.MANGA_ID_CONTAINER).fetch(request);
  },
};
