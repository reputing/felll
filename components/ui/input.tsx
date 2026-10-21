import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn("flex h-11 w-full rounded-full border-1.5 border-line bg-paper px-4 text-sm font-medium focus:border-frost-hot focus:outline-none disabled:opacity-50", className)}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
