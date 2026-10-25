// Thin Worker fronting the VortexScansAPI container
// (github.com/Shineii86/VortexScansAPI), an English manhwa API for
// vortexscans.org. Forwards to the Node server inside the container on port 3000.
//
// Endpoints: GET /api/manga (list), /api/manga?slug= (detail),
// /api/manga?slug=&action=chapters (chapters), /api/chapter?slug=&chapter=
// (page images). It serves its OWN catalogue (not MangaDex's), so surfacing it
// needs a dedicated browse section, not the by-title MangaDex fallback.
import { Container, getContainer } from "@cloudflare/containers";

export class VortexScansContainer extends Container {
  constructor(ctx, env) {
    super(ctx, env);
    this.defaultPort = 3000;
    this.sleepAfter = "30m";
  }
}

export default {
  async fetch(request, env) {
    return getContainer(env.VORTEXSCANS_CONTAINER).fetch(request);
  },
};
