// Thin Worker fronting the jandapress container (github.com/sinkaroid/jandapress),
// a Rust/Axum REST API for nhentai + other doujinshi sites. Forwards to the
// binary listening on port 3000.
//
// ⚠️ ADULT: doujinshi (18+). The frontend surfaces it only behind the 18+ gate
// (users.adult_ok) via its own /read/doujin catalogue.
//
// Endpoints used by the site:
//   GET /nhentai/search?key=<q>&page=<n>&sort=popular  → { data: [{ id, title, cover, total }] }
//   GET /nhentai/get?book=<id>                          → { data: { id, title, image: [<page urls>], num_pages } }
import { Container, getContainer } from "@cloudflare/containers";

export class DoujinContainer extends Container {
  constructor(ctx, env) {
    super(ctx, env);
    this.defaultPort = 3000;
    this.sleepAfter = "30m";
    // A browser-ish UA reduces nhentai greylisting the datacenter IP; GraphQL
    // off since we only call the REST routes. If nhentai starts refusing the
    // shared IP, add NHENTAI_API_KEY here (its official /api/v2 key).
    this.envVars = {
      PORT: "3000",
      JANDAPRESS_GRAPHQL: "false",
      USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    };
  }
}

export default {
  async fetch(request, env) {
    return getContainer(env.DOUJIN_CONTAINER).fetch(request);
  },
};
