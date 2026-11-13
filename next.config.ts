import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  experimental: {
    // smaller client bundles: only the icons and primitives a page uses
    optimizePackageImports: ["lucide-react", "@radix-ui/react-dropdown-menu", "@radix-ui/react-select", "@radix-ui/react-dialog"],
  },
  async headers() {
    return [
      { source: "/:file(logo.png|favicon.png)", headers: [{ key: "cache-control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
      // The movie player frames third-party pages. frame-src names the only places a frame may load or redirect to, so one
      // that tries to send itself to an ad page is stopped by the browser (anti-redirect; see lib/movie-servers.ts).
      // YouTube is for trailers. Only frame-src is set here, so nothing else on the page is restricted.
      // The watch page can show one outside anime player (Flixcloud) in a sandboxed frame; frame-src names the only places a frame may
      // load or redirect to. Only frame-src is set, so nothing else on the page is restricted.
      { source: "/watch/:path+", headers: [{ key: "content-security-policy", value: "frame-src 'self' https://flixcloud.cc https://www.youtube-nocookie.com https://www.youtube.com" }] },
      { source: "/movies/:path+", headers: [{ key: "content-security-policy", value: "frame-src 'self' https://cinesrc.st https://www.youtube-nocookie.com https://www.youtube.com" }] },
      {
        source: "/:path*",
        headers: [
          // Browsers only honour this over https, which is where it matters: once seen, they stop trying http for six months
          { key: "strict-transport-security", value: "max-age=15552000" },
          { key: "x-content-type-options", value: "nosniff" },
          { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
          { key: "x-frame-options", value: "SAMEORIGIN" },
          { key: "permissions-policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
