import type { Metadata, Viewport } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { DEFAULT_SKIN, isSkin } from "@/lib/skins";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex", display: "swap" });

export const metadata: Metadata = {
  title: { default: "cupcake.gg · the watch box", template: "%s · cupcake.gg" },
  description: "A members-only watch box for kuro. Every anime on your list, in one little box.",
  icons: { icon: "/favicon.png", apple: "/logo.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#09080a",
  colorScheme: "dark light",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // the device's pick, else the member's saved skin (shared with the members
  // layout through cache(), so no extra query), else black and pink
  const picked = (await cookies()).get("skin")?.value;
  const skin = isSkin(picked) ? picked : ((await currentUser())?.theme ?? DEFAULT_SKIN);
  return (
    <html lang="en" data-skin={isSkin(skin) ? skin : DEFAULT_SKIN} className={`${manrope.variable} ${plex.variable}`}>
      <head>
        <link rel="preconnect" href="https://cdn.myanimelist.net" crossOrigin="" />
        <link rel="dns-prefetch" href="https://i.ytimg.com" />
      </head>
      <body className="min-h-screen overflow-x-hidden">{children}</body>
    </html>
  );
}
