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
      {
        source: "/:path*",
        headers: [
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
