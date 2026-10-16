import { cn } from "@/lib/utils";
import "./phase-navigation.css";
export interface PhaseOption<T extends string> { key: T; label: string; description?: string; }
export function PhaseNavigation<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: PhaseOption<T>[] }): JSX.Element {
  return <nav className="phase-navigation" aria-label="Fases del proyecto">{options.map((phase,index) => <button key={phase.key} type="button" className={cn("phase-navigation__item", value === phase.key && "is-active")} aria-current={value === phase.key ? "step" : undefined} aria-label={`Fase ${index + 1}: ${phase.label}`} title={phase.description} onClick={() => onChange(phase.key)}><span className="phase-navigation__text"><small>Fase {index + 1}</small><strong>{phase.label}</strong>{phase.description && <span>{phase.description}</span>}</span></button>)}</nav>;
}