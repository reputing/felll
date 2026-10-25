// Thin Worker fronting the man-go container (github.com/la-lo-go/man-go), a Go
// manga API. Forwards every request to the Go server inside the container on
// port 7070. Same pattern as anivexa-server/ and consumet-server/.
//
// NOTE: man-go's sources are mostly Spanish (InManga etc.) and the project is a
// work in progress, so this is a non-English extra — the frontend does not wire
// it by default. Deploy it only if you want those sources.
import { Container, getContainer } from "@cloudflare/containers";

export class MangoContainer extends Container {
  constructor(ctx, env) {
    super(ctx, env);
    this.defaultPort = 7070;
    this.sleepAfter = "30m";
    this.envVars = { API_PORT: "7070", API_IP: "0.0.0.0" };
  }
}

export default {
  async fetch(request, env) {
    return getContainer(env.MANGO_CONTAINER).fetch(request);
  },
};
