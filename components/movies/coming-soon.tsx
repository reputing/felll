// Stand-in for the movies section when no catalog backend is configured
// (TMDB_API_KEY unset). A blurred faux-poster grid sits behind a glass "Coming
// soon" card, so the page still feels like the movies section without a backend.
export function MoviesComingSoon() {
  return (
    <div className="relative overflow-hidden rounded-box border-1.5 border-line bg-cream-card">
      {/* decorative poster grid, blurred so nothing reads as real content */}
      <div aria-hidden className="pointer-events-none grid select-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5 p-4 blur-2xl saturate-[.8]">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] rounded-2xl skeleton" />
        ))}
      </div>
      {/* overlay */}
      <div className="absolute inset-0 grid place-items-center bg-cream-card/50 p-6 text-center">
        <div className="max-w-md rounded-box border-1.5 border-line bg-paper/90 px-8 py-10 shadow-halo">
          <div className="eyebrow">Cupcake / watch</div>
          <p className="mt-2 text-2xl font-extrabold tracking-[-.6px] text-frost-deep">Coming soon</p>
          <p className="mt-2 text-[14px] leading-relaxed text-plum-muted">
            Movies &amp; series are taking a short break while we move to a new
            streaming backend. Everything anime is still right here. Check back soon. ✿
          </p>
        </div>
      </div>
    </div>
  );
}
