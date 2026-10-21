import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header, SITE_NAME } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: "Stream anime in HD with fast, typo-tolerant search.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <Header />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
