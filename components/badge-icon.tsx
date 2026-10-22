// Hand-drawn line icons for each achievement, so the badges read as crafted
// rather than a row of emoji. One <path> set per badge key; all stroke
// currentColor on a 24×24 grid.

const PATHS: Record<string, React.ReactNode> = {
  first: <path d="M12 4l1.7 5 5 1.7-5 1.7L12 17.4 10.3 12.4 5.3 10.7 10.3 9z" />,
  finisher: <><circle cx="12" cy="12" r="8.3" /><path d="M8.4 12.3l2.5 2.5 4.6-5.2" /></>,
  completionist: <><path d="M8 4.5h8v3.5a4 4 0 0 1-8 0z" /><path d="M8 5.5H5.6A2.4 2.4 0 0 0 8 8M16 5.5h2.4A2.4 2.4 0 0 1 16 8" /><path d="M10.5 12.3v2.4M13.5 12.3v2.4M9 19h6M10 19c0-1.4.8-2 2-2s2 .6 2 2" /></>,
  century: <><circle cx="12" cy="11.5" r="6.3" /><path d="M9.6 11.5h4.8M12 9.1v4.8" /><path d="M8.5 16.5L7 20l2.6-1 1.1 2 1.3-3M15.5 16.5L17 20l-2.6-1" /></>,
  marathon: <><circle cx="12" cy="13.5" r="6.5" /><path d="M12 13.5V10M10 3.5h4M18.6 7.9l1.4-1.4" /></>,
  devoted: <path d="M19 13.6A7.4 7.4 0 1 1 10.4 5.2a6 6 0 0 0 8.6 8.4z" />,
  critic: <path d="M12 4l2.3 4.7 5.2.8-3.8 3.6.9 5.2L12 15.9l-4.6 2.4.9-5.2-3.8-3.6 5.2-.8z" />,
  tastemaker: <path d="M12 19.3l-7-6.7a4.2 4.2 0 0 1 6-5.9l1 1 1-1a4.2 4.2 0 0 1 6 5.9z" />,
  streak7: <path d="M12 3.6c3 3 4.6 5.6 4.6 8.6a4.6 4.6 0 0 1-9.2 0c0-1.4.5-2.5 1.5-3.4.6 1.3 1.1 2.3 1.6 2.5.3-2 .8-5.1 1.5-7.7z" />,
  streak30: <path d="M13.2 3l-7 10h5l-1.2 8 7.2-10.3h-5z" />,
  chatterbox: <path d="M4.6 6.6A2.1 2.1 0 0 1 6.7 4.5h10.6a2.1 2.1 0 0 1 2.1 2.1v6a2.1 2.1 0 0 1-2.1 2.1H10l-4 3.1V14.7H6.7a2.1 2.1 0 0 1-2.1-2.1z" />,
  collector: <><path d="M12 4l8 4-8 4-8-4z" /><path d="M4.4 12L12 15.8 19.6 12M4.4 16L12 19.8 19.6 16" /></>,
};

export function BadgeIcon({ badge, className }: { badge: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {PATHS[badge] ?? PATHS.first}
    </svg>
  );
}
