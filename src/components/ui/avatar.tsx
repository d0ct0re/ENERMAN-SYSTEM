import { cn } from "@/lib/utils";

interface AvatarProps {
  initials: string;
  className?: string;
}

export function Avatar({ initials, className }: AvatarProps): JSX.Element {
  return (
    <div
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-sm font-bold text-foreground shadow-soft",
        className,
      )}
    >
      {initials}
    </div>
  );
}
