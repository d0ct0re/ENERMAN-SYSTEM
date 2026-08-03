import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-2xl border border-[#3F3F46] bg-[#313136] px-4 text-sm text-foreground outline-none transition placeholder:text-[#71717A] focus:border-accent/50 focus:ring-4 focus:ring-accent/10",
      className,
    )}
    {...props}
  />
));

Input.displayName = "Input";
