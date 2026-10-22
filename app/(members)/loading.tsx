import type { CSSProperties } from "react";

// Shown instantly on navigation while the server renders the next page. A
// sticker wordmark that boings and glitches cupcake <-> kuro (ported from
// nuzzle); it only fades in after a beat, so a fast load never flashes it.
const WORD = "cupcake";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-5" aria-busy="true">
      <div className="boot" role="status" aria-label="Loading cupcake">
        <div className="boot-word" aria-hidden="true">
          <span className="w nz">
            {[...WORD].map((ch, i) => <i key={i} style={{ "--i": i } as CSSProperties}>{ch}</i>)}
          </span>
          <span className="w kr">kuro</span>
        </div>
        <p className="boot-say">unwrapping your watch box<b>.</b><b>.</b><b>.</b></p>
        <p className="boot-slow">the kitchen’s running a little behind. still baking ♡</p>
      </div>
    </div>
  );
}
