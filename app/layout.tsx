import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { DEFAULT_SKIN, isSkin } from "@/lib/skins";
import "./globals.css";

// Plus Jakarta Sans: a clean, modern, professional grotesque — crisper than the
// old wordmark font while keeping the friendly feel. Loaded as the variable font
// (no weight array) so next/font emits a single @font-face — this also sidesteps
// a nondeterministic Turbopack import-map error on multi-weight google fonts.
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans-src", display: "swap" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex", display: "swap" });

const TAGLINE = "Anime, manga and movies in one little box. Lists, ratings, comments and next-episode countdowns, for kuro members.";

export const metadata: Metadata = {
  metadataBase: new URL("https://cupcake.gg"),
  title: { default: "cupcake.gg · the watch box", template: "%s · cupcake.gg" },
  description: TAGLINE,
  icons: { icon: "/cupcake.png", apple: "/cupcake.png" },
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    url: "https://cupcake.gg",
    siteName: "cupcake.gg",
    title: "cupcake.gg · the kuro watch box",
    description: TAGLINE,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "cupcake.gg: your anime, manga and movies in one box" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "cupcake.gg · the kuro watch box",
    description: TAGLINE,
    images: ["/og.png"],
  },
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
    <html lang="en" data-skin={isSkin(skin) ? skin : DEFAULT_SKIN} className={`${sans.variable} ${plex.variable}`}>
      <head>
        <link rel="preconnect" href="https://cdn.myanimelist.net" crossOrigin="" />
        <link rel="preconnect" href="https://uploads.mangadex.org" crossOrigin="" />
        <link rel="preconnect" href="https://image.tmdb.org" crossOrigin="" />
        <link rel="dns-prefetch" href="https://i.ytimg.com" />
      </head>
      <body className="min-h-screen overflow-x-hidden">{children}</body>
    </html>
  );
}
