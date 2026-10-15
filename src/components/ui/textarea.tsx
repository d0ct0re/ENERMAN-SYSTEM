import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[120px] w-full rounded-2xl border border-[color:var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-[color:var(--text-muted)] focus:border-accent/50 focus:ring-4 focus:ring-accent/10",
        className,
      )}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";
