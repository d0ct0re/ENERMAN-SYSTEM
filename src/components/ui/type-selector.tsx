import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ACTIVE_PROJECT_TYPES, PROJECT_TYPE_LABELS, ProjectType } from "@/types";
import { cn } from "@/lib/utils";

interface TypeSelectorProps {
  value: ProjectType;
  onChange: (type: ProjectType) => void;
}

export function TypeSelector({ value, onChange }: TypeSelectorProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between rounded-[14px] border bg-surface-elevated px-4 py-3 text-sm text-left transition focus:outline-none",
          open ? "border-accent/60" : "border-border-default hover:border-accent/30",
        )}
      >
        <span className="flex items-center gap-2">
          <span className="font-bold text-accent">{value}</span>
          <span className="text-ink-tertiary">— {PROJECT_TYPE_LABELS[value]}</span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-border-default bg-surface shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          {ACTIVE_PROJECT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(type); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-accent/10",
                value === type ? "bg-accent/5" : "",
              )}
            >
              <span className={cn("w-12 font-bold", value === type ? "text-accent" : "text-ink-secondary")}>
                {type}
              </span>
              <span className="text-muted-foreground">{PROJECT_TYPE_LABELS[type]}</span>
              {value === type && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
