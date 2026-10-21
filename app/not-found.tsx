import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-svh place-items-center px-5 text-center">
      <div className="flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={72} height={72} className="animate-float rounded-2xl bg-paper p-1" />
        <p className="font-mono text-[13px] text-frost-text">404</p>
        <p className="text-2xl font-extrabold tracking-tight text-frost-deep">This box is empty.</p>
        <p className="text-plum-muted">That page wandered off.</p>
        <Link href="/home" className="flex h-11 items-center rounded-full bg-frost px-5 text-[14px] font-extrabold text-frost-ink shadow-press">Back to the watch box</Link>
      </div>
    </div>
  );
}
