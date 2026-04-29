import { PriorityLevel } from "@/types";
import { cn } from "@/lib/utils";

const labels: Record<PriorityLevel, string> = {
  low:      "Baja",
  medium:   "Media",
  high:     "Alta",
  critical: "Crítica",
};

const tones: Record<PriorityLevel, string> = {
  low:      "bg-[#3F3F46] text-[#888888]",
  medium:   "bg-secondary/15 text-secondary ring-1 ring-secondary/30",
  high:     "bg-[#F5A524]/15 text-[#F5A524] ring-1 ring-[#F5A524]/30",
  critical: "bg-[#E24B4A]/15 text-[#E24B4A] ring-1 ring-[#E24B4A]/30 shadow-glow-danger",
};

const dots: Record<PriorityLevel, string> = {
  low:      "bg-[#71717A]",
  medium:   "bg-secondary",
  high:     "bg-[#F5A524]",
  critical: "bg-[#E24B4A] animate-pulse",
};

export function PriorityBadge({ priority }: { priority: PriorityLevel }): JSX.Element {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", tones[priority])}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dots[priority])} />
      {labels[priority]}
    </span>
  );
}
