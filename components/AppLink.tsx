import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * Plain-anchor replacement for next/link.
 *
 * Client-side (RSC) navigation is broken under our OpenNext-on-Cloudflare
 * deployment: RSC requests get a 307 that strips the `?_rsc` value, so Next's
 * soft navigations stall and a left-click appears to do nothing. Full-page
 * navigations return 200 and work, so we render a real <a> and let the browser
 * navigate. Drop-in for the `href`/`className`/`children` usage across the app.
 */
export function AppLink({
  href,
  children,
  ...rest
}: { href: string; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
