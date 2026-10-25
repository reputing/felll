// Thin Worker fronting the OmegaAPI container (github.com/Shineii86/OmegaAPI),
// a Next.js API for omegascans.org. Forwards to `next start` inside the
// container on port 3000.
//
// ⚠️ ADULT: OmegaAPI serves 18+ manhwa. The frontend must only surface it behind
// an 18+ gate, and via its OWN catalogue (its titles are not in MangaDex's
// SFW-filtered browse). Deploy only if you want adult content on the site.
//
// Endpoints: GET /api/v1/series?q= (search), /api/v1/series/:slug?include=chapters
// (detail + chapters), /api/v1/chapter/:slug/:chapter (page images -> data.images).
import { Container, getContainer } from "@cloudflare/containers";

export class OmegaContainer extends Container {
  constructor(ctx, env) {
    super(ctx, env);
    this.defaultPort = 3000;
    this.sleepAfter = "30m";
    this.envVars = { PORT: "3000", HOSTNAME: "0.0.0.0" };
  }
}

export default {
  async fetch(request, env) {
    return getContainer(env.OMEGA_CONTAINER).fetch(request);
  },
};
