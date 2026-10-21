import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-frost text-frost-ink shadow-press hover:brightness-105",
        outline: "border-1.5 border-line bg-paper text-plum hover:border-frost-hot hover:text-frost-text",
        soft: "bg-cream-blush text-frost-deep hover:bg-line-soft",
        ghost: "text-plum hover:bg-cream-tint",
        night: "border-1.5 border-night-edge bg-night/60 text-night-text hover:border-frost",
      },
      size: { default: "h-11 rounded-full px-5 text-[14px]", sm: "h-9 rounded-xl px-3 text-[12.5px]", lg: "h-12 rounded-full px-6 text-[15px]", block: "h-[50px] w-full rounded-2xl text-[14.5px]", icon: "size-9 rounded-xl" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
