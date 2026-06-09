import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const FIXED_DEPARTMENTS = [
  "CIDEP",
  "EGADE",
  "CITES",
  "OSEH",
  "MANTENIMIENTO",
  "HUB",
  "EXPEDITION",
  "DISTRICTO TEC",
  "CALIDAD",
  "CAMPUS SAN PEDRO",
  "COMPRAS",
  "GUARDERIA TEC",
  "GUARDERIA SAN JOSE",
  "SERVICIOS GENERALES",
  "SERVICIOS ALIMENTARIOS",
  "SOSTENIBILIDAD",
  "TECNOLOGIA",
  "TEC SALUD",
  "TECMILENIO",
];

interface DepartmentInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function DepartmentInput({ value, onChange, placeholder = "Departamento" }: DepartmentInputProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = value.trim()
    ? FIXED_DEPARTMENTS.filter((d) => d.toLowerCase().includes(value.trim().toLowerCase()))
    : FIXED_DEPARTMENTS;

  const isCustomValue = value.trim() && !FIXED_DEPARTMENTS.some((d) => d.toLowerCase() === value.trim().toLowerCase());

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

      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-60 overflow-y-auto rounded-2xl border border-[#3F3F46] bg-[#27272A] shadow-panel">
          {suggestions.map((d) => (
            <button
              key={d}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(d); setOpen(false); }}
              className={cn(
                "flex w-full items-center px-4 py-3 text-left text-sm font-semibold transition hover:bg-accent/10 hover:text-accent",
                value === d ? "text-accent" : "text-foreground",
              )}
            >
              {d}
            </button>
          ))}

          {isCustomValue && (
            <div className="px-4 py-3 text-sm text-[#888888]">
              Se usará <span className="font-semibold text-foreground">"{value}"</span> como departamento
            </div>
          )}
        </div>
      )}
    </div>
  );
}
