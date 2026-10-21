// Shown instantly on navigation while the server renders the next page.
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-3 pt-4 sm:px-5" aria-busy="true" aria-label="Loading">
      <div className="h-[260px] rounded-shell skeleton" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-[300px] rounded-3xl skeleton" style={{ animationDelay: `${i * 60}ms` }} />)}
      </div>
    </div>
  );
}
