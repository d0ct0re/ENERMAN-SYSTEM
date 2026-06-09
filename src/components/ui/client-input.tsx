import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const FIXED_CLIENTS = ["ITESM", "VIAKON", "PROLEC"];

interface ClientInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ClientInput({ value, onChange, placeholder = "Cliente" }: ClientInputProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Si hay texto escrito, filtrar la lista fija; si no, mostrar todos
  const suggestions = value.trim()
    ? FIXED_CLIENTS.filter((c) => c.toLowerCase().includes(value.trim().toLowerCase()))
    : FIXED_CLIENTS;

  const isCustomValue = value.trim() && suggestions.length === 0;

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
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-[#3F3F46] bg-[#27272A] shadow-panel">
          {suggestions.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(c); setOpen(false); }}
              className={cn(
                "flex w-full items-center px-4 py-3 text-left text-sm font-semibold transition hover:bg-accent/10 hover:text-accent",
                value === c ? "text-accent" : "text-foreground",
              )}
            >
              {c}
            </button>
          ))}

          {isCustomValue && (
            <div className="px-4 py-3 text-sm text-[#888888]">
              Se usará <span className="font-semibold text-foreground">"{value}"</span> como cliente
            </div>
          )}
        </div>
      )}
    </div>
  );
}
