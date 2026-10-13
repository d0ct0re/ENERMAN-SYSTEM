import { cn } from "@/lib/utils";

const logoUrl = "/logo-wordmark-transparent.png";

interface AmperLogoProps {
  onClick?: () => void;
  className?: string;
}

export function AmperLogo({ onClick, className }: AmperLogoProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="ENERMAN — inicio"
      className={cn(
        "inline-flex items-center rounded-xl transition-all duration-150",
        "hover:scale-105 hover:brightness-110",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50",
        "active:scale-95",
        className,
      )}
    >
      <img
        src={logoUrl}
        alt="ENERMAN"
        className="h-9 w-auto sm:h-10 object-contain"
        draggable={false}
      />
    </button>
  );
}
