import type { CSSProperties } from "react";

// Shown instantly on navigation while the server renders the next page: a glass card with the cupcake, a halo, and sprinkles
// orbiting it, a shimmering wordmark and a light running along a bar. It only fades in after a beat (see .boot2), so a fast
// load never flashes it. Everything moves with CSS, so it costs no JavaScript and reduced-motion turns it all off.
const SPRINKLES = [
  { c: "var(--frost)", d: "0s" }, { c: "#9479e8", d: "-1.4s" }, { c: "#4fbf9c", d: "-2.8s" }, { c: "#e0a93a", d: "-4.1s" },
];

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-5" aria-busy="true">
      <div className="boot2" role="status" aria-label="Loading cupcake">
        <div className="boot2-card glass-strong beam">
          <div className="boot2-orbit" aria-hidden="true">
            <span className="halo" />
            <span className="orb" />
            <span className="orb o2" />
            {SPRINKLES.map((s, i) => <i key={i} className="dot" style={{ "--c": s.c, "--d": s.d } as CSSProperties} />)}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cupcake.png" alt="" width={82} height={82} />
          </div>
          <div className="boot2-word text-shimmer" aria-hidden="true">cupcake<span>.gg</span></div>
          <div className="boot2-bar" aria-hidden="true"><b /></div>
          <p className="boot2-say" aria-hidden="true">
            <span>unwrapping your watch box</span>
            <span>warming up the oven</span>
            <span>adding the sprinkles</span>
          </p>
        </div>
        <p className="boot-slow">the kitchen’s running a little behind. still baking ♡</p>
      </div>
    </div>
  );
}
