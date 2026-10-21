export function GridSkeleton({ n = 12 }: { n?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
      {Array.from({ length: n }, (_, i) => <div key={i} className="h-[340px] rounded-3xl skeleton" />)}
    </div>
  );
}
