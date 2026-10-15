import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  headerContent?: React.ReactNode;
  footer?: React.ReactNode;
  lockScroll?: boolean;
}

export function Dialog({ open, onOpenChange, title, description, children, className, bodyClassName, headerContent, footer, lockScroll = false }: DialogProps): JSX.Element | null {
  React.useEffect(() => {
    if (!open || !lockScroll) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open, lockScroll]);
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="absolute inset-0" onClick={() => onOpenChange(false)} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-[30px] border border-[color:var(--line)] bg-[var(--surface)] shadow-panel",
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--line)] bg-[var(--surface)]/50 px-5 py-5 sm:px-6">
          <div className="min-w-0 space-y-1 break-words">
            {title ? <h2 className="text-lg font-bold text-foreground">{title}</h2> : null}
            {description ? <p className="mt-0.5 font-mono text-xs tracking-wide text-[color:var(--text-muted)]">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="shrink-0 rounded-full p-2 text-[color:var(--text-muted)] transition hover:bg-[var(--surface-alt)] hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {headerContent}
        <div className={cn("hide-scrollbar min-h-0 overflow-y-auto px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
        {footer}
      </div>
    </div>
  );
}
