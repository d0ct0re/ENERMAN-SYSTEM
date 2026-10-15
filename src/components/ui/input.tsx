import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-2xl border border-[color:var(--line)] bg-[var(--surface)] px-4 text-sm text-foreground outline-none transition placeholder:text-[color:var(--text-muted)] focus:border-accent/50 focus:ring-4 focus:ring-accent/10",
      className,
    )}
    {...props}
  />
));

Input.displayName = "Input";
