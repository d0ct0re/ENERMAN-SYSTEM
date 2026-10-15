import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "accent" | "outline" | "ghost" | "danger";
type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-[var(--surface)] text-white border border-[color:var(--line)] shadow-soft hover:bg-[var(--surface-alt)] hover:border-[color:var(--line)] focus-visible:ring-white/15",
  secondary:
    "bg-secondary text-white shadow-soft hover:bg-secondary/90 focus-visible:ring-secondary/30",
  accent:
    "bg-accent text-[#111111] font-bold shadow-glow-gold hover:bg-accent/90 focus-visible:ring-accent/30",
  outline:
    "border border-[color:var(--line)] bg-transparent text-foreground hover:border-[color:var(--line)] hover:bg-[var(--surface)] focus-visible:ring-white/15",
  ghost:
    "bg-transparent text-foreground hover:bg-[var(--surface)] focus-visible:ring-white/15",
  danger:
    "bg-danger text-white shadow-soft hover:bg-danger/90 focus-visible:ring-danger/20",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-11 px-4 py-2",
  sm:      "h-9 rounded-xl px-3 text-sm",
  lg:      "h-12 rounded-xl px-5 text-base",
  icon:    "h-11 w-11 rounded-full p-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = "Button";
