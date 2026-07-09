import { PriorityLevel } from "@/types";
import { cn } from "@/lib/utils";

const labels: Record<PriorityLevel, string> = {
  low:      "Baja",
  medium:   "Media",
  high:     "Alta",
  critical: "Crítica",
};

const tones: Record<PriorityLevel, string> = {
  low:      "bg-border-default text-muted-foreground",
  medium:   "bg-secondary/15 text-secondary ring-1 ring-secondary/30",
  high:     "bg-brand/15 text-brand ring-1 ring-brand/30",
  critical: "bg-danger/15 text-danger ring-1 ring-danger/30 shadow-glow-danger",
};

const dots: Record<PriorityLevel, string> = {
  low:      "bg-ink-tertiary",
  medium:   "bg-secondary",
  high:     "bg-brand",
  critical: "bg-danger animate-pulse",
};

export function PriorityBadge({ priority }: { priority: PriorityLevel }): JSX.Element {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", tones[priority])}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dots[priority])} />
      {labels[priority]}
    </span>
  );
}
