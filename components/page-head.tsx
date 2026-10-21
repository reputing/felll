export function PageHead({ eyebrow, title, sub, children }: { eyebrow: string; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 px-1">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="mt-1.5 text-[clamp(32px,4vw,48px)] font-extrabold leading-none tracking-[-2px] text-frost-text">{title}<span className="text-frost">.</span></h1>
        {sub && <p className="mt-2 font-medium text-plum-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
