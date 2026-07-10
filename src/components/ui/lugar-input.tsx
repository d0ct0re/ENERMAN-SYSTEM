import { ChevronDown, MapPin, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const FIXED_LUGARES = [
  "Arena Borrego","Auditorio Luis Elizondo","Aulas 1","Aulas 2","Aulas 3","Aulas 4","Aulas 6","Aulas 7",
  "BBVA Aulas 3","Biblioteca","Biotecnologia","Brugge","CAH3-1","Campus 1","Campus 2","Campus 3",
  "Carls Jr","Casa Naranjos","Casa Solar","CDB1","CDB2","CEDES","Centrales Administrativo","Centrales Sur",
  "Centro de Datos","Centro de Congresos","CETEC","Chilaquiles Tec","CIAP","Cisterna 1","Cisterna 2",
  "Comedor Centrales","Correos","Dc Hotchos Edif D","DOMO CULTURAL","Doña Tota","Edificio A","Edificio D",
  "Edificio De Negocios (DAF)","Embox","Espacio Reflexión","Estacionamiento 1","Estacionamiento 2",
  "Estacionamiento 3","Estacionamiento 6","Estadio Borrego","Expedition","Farmville","Grill Team",
  "Guarderia TEC","I-HUB","L2 Y 3 PA","L30 Y 31","Laboratorios de Manufactura","Laboratorios DÍA",
  "LAD (Escuela De Arte y Diseño)","Little Caesars","Local 12 Y 13 PB","Local 14 y 15 PB","Local 24 y 25",
  "Local 41","Local A, B Y D","Local ABD (local 1 PA)","Megacentral","Mil Caras","Nectar Works","Nikkori",
  "Nucleo","Oxxo A4","Oxxo Centrales","Oxxo Smart","Pabellón L-2 Planta alta -2 (Arte y Cultura)",
  "Pabellon Local 1 PA","Pabellon Local 11 PB","Pabellon Local 12 y 13 PA","Pabellon TEC – L37",
  "Pabellon TEC – L38","Pabellón La Carreta","Panem","Parque - Yogurfrut","Parque Central",
  "Parque central - Pasta di Trevi","Parque central - Washdog","Parque central- Los 4 Parilla Sonorense",
  "Parque central- Pide un deseo","Parvadomus","Pozo 7","Pozo 14","Pozo Agua Potable - 3",
  "Pozo Agua Potable - 11","Pozo Agua Potable - 12","Pozo Agua Riego - 4","Pozo Agua Riego - 8",
  "Pozo Agua Riego - 15","PROLEC LABS","PTAR","Radiadores y maderas","Rectoría","Residencias 10 y 15",
  "Residencias 11","Residencias 12","Residencias 13","VIAKON-San Nicolas",
];

interface LugarInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function LugarInput({ value, onChange, className }: LugarInputProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const trimmed = search.trim();
  const filtered = trimmed
    ? FIXED_LUGARES.filter((l) => l.toLowerCase().includes(trimmed.toLowerCase()))
    : FIXED_LUGARES;
  const showCustomOption =
    trimmed.length > 0 &&
    !FIXED_LUGARES.some((l) => l.toLowerCase() === trimmed.toLowerCase());

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 60);
  }, [open]);

  const handleSelect = (lugar: string): void => {
    onChange(lugar);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between rounded-[14px] border bg-surface-elevated px-4 py-3 text-sm text-left transition focus:outline-none",
          open ? "border-accent/60" : "border-border-default hover:border-accent/30",
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          {value ? (
            <span className="truncate font-medium text-foreground">{value}</span>
          ) : (
            <span className="text-ink-tertiary">Lugar</span>
          )}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-border-default bg-surface shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 border-b border-border-default px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar lugar…"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-ink-tertiary focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setSearch("")}
                className="text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>

          <div className="max-h-52 overflow-y-auto overscroll-contain">
            {showCustomOption && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(trimmed)}
                className="flex w-full items-center gap-2 border-b border-border-default px-4 py-2.5 text-left text-sm text-accent transition hover:bg-accent/10"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                Usar: &ldquo;{trimmed}&rdquo;
              </button>
            )}
            {filtered.length === 0 && !showCustomOption ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Sin resultados</p>
            ) : (
              filtered.map((lugar) => (
                <button
                  key={lugar}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(lugar)}
                  className={cn(
                    "flex w-full items-center px-4 py-2.5 text-left text-sm transition hover:bg-accent/10",
                    value === lugar ? "text-accent font-medium" : "text-ink-secondary",
                  )}
                >
                  {lugar}
                </button>
              ))
            )}
          </div>

          <div className="border-t border-border-default px-4 py-2">
            <span className="text-[10px] text-ink-tertiary">{filtered.length} lugar{filtered.length !== 1 ? "es" : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}
