import { Bookmark } from "lucide-react";

// Bookmark that fills when saved.
export const SaveIcon = ({ on, className }: { on: boolean; className?: string }) => (
  <Bookmark className={className} fill={on ? "currentColor" : "none"} strokeWidth={2.2} />
);
