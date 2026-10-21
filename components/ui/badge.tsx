import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 whitespace-nowrap font-bold", {
  variants: {
    variant: {
      default: "rounded-full bg-frost-hot text-white",
      outline: "rounded-full border-1.5 border-line text-frost-deep",
      paper: "rounded-[10px] bg-cream-card text-plum",
      tag: "rounded-md border border-line bg-cream-card text-[10px] font-extrabold text-plum-muted",
      night: "rounded-full border border-night-edge bg-night/75 text-night-text",
    },
    size: { default: "h-[26px] px-[11px] text-[11.5px]", sm: "h-[22px] px-2 text-[11px]", xs: "h-5 px-1.5" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}
