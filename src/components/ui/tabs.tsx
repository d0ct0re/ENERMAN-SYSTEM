import { cn } from "@/lib/utils";

export interface TabOption<T extends string> {
  key: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: TabOption<T>[];
  className?: string;
}

export function Tabs<T extends string>({ value, onValueChange, options, className }: TabsProps<T>): JSX.Element {
  return (
    <div className={cn("chip-scroll flex gap-2 overflow-x-auto pb-1", className)}>
      {options.map((option) => {
        const active = option.key === value;

        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onValueChange(option.key)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200",
              active
                ? "border-transparent bg-accent text-[#111111] font-black shadow-glow-gold"
                : "border-[#3F3F46] bg-[#27272A] text-[#888888] hover:border-[#52525B] hover:bg-[#313136] hover:text-white",
            )}
          >
            <span>{option.label}</span>
            {typeof option.count === "number" ? (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs font-bold tabular-nums",
                  active ? "bg-[#1E1E20]/30 text-[#111111]" : "bg-[#3F3F46] text-[#BCBCBC]",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
