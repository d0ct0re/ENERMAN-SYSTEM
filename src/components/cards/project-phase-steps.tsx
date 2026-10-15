import { Check } from "lucide-react";
import { isProjectF1Complete, isProjectF2Complete } from "@/lib/utils";
import type { ProjectItem } from "@/types";

export type ProjectPhase = "f1" | "f2" | "f3" | "f4";

export function getProjectPhases(project: ProjectItem) {
  return [
    { key: "f1" as const, label: "F1", name: "Apertura", done: isProjectF1Complete(project) },
    { key: "f2" as const, label: "F2", name: "Ejecución", done: isProjectF2Complete(project) },
    { key: "f3" as const, label: "F3", name: "Financiero", done: !!(project.totalSinIva && project.totalSinIva > 0) },
    { key: "f4" as const, label: "F4", name: "Pagos", done: !!project.pagosProyecto?.length },
  ];
}

export function ProjectPhaseSteps({ project, onSelect, canViewFinancial = false }: { project: ProjectItem; onSelect?: (phase: ProjectPhase) => void; canViewFinancial?: boolean }): JSX.Element {
  const phases = getProjectPhases(project).filter(phase => canViewFinancial || phase.key === "f1" || phase.key === "f2");
  const current = phases.findIndex((phase) => !phase.done);
  return <ol className="project-phase-steps" aria-label="Fases: seguimiento de datos registrados">
    {phases.map((phase, index) => {
      const state = phase.done ? "Datos registrados" : index === current ? "Siguiente fase con datos pendientes" : "Datos pendientes";
      return <li key={phase.key} className={phase.done ? "is-complete" : index === current ? "is-current" : ""}>
        <button type="button" disabled={!onSelect || (!canViewFinancial && (phase.key === "f3" || phase.key === "f4"))} onClick={() => onSelect?.(phase.key)} aria-label={`${phase.label}: ${phase.name}. ${state}${!canViewFinancial && (phase.key === "f3" || phase.key === "f4") ? ". Acceso exclusivo de administraci\u00f3n" : ""}`}><span className="project-phase-steps__dot">{phase.done && <Check size={10} />}</span><span>{phase.label}</span><span className="project-phase-steps__tooltip">{phase.name} · {state}</span></button>
      </li>;
    })}
  </ol>;
}
