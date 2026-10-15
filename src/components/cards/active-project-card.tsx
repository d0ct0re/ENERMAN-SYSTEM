import { FolderOpen, Clock3, User } from "lucide-react";
import { PriorityBadge } from "@/components/common/priority-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { daysSince, formatDate, formatOptionalDate, getProjectSequence, isNewItem } from "@/lib/utils";
import { getProjectPhases, ProjectPhaseSteps, type ProjectPhase } from "./project-phase-steps";
import { ProjectItem, PROJECT_TYPE_LABELS } from "@/types";
import "./active-project-card.css";

interface ActiveProjectCardProps {
  project: ProjectItem;
  onOpen: (projectId: string) => void;
  onOpenPhase?: (projectId: string, phase: ProjectPhase) => void;
  canEdit?: boolean;
  assignedEngineerName?: string;
  showNewBadge?: boolean;
}

/** Operational summary; phase indicators describe recorded data, not work progress. */
export function ActiveProjectCard({ project, onOpen, onOpenPhase, assignedEngineerName, showNewBadge = false }: ActiveProjectCardProps): JSX.Element {
  const isInactive = daysSince(project.updatedAt) >= 14;
  const missingPhases = getProjectPhases(project).filter(phase => (phase.key === "f1" || phase.key === "f2") && !phase.done).map(phase => 'Fase ' + phase.label.slice(1));
  const missingLabel = missingPhases.length ? 'Faltan datos: ' + (missingPhases.length === 1 ? missingPhases[0] : missingPhases.slice(0, -1).join(', ') + ' y ' + missingPhases[missingPhases.length - 1]) : 'Datos de las dos fases registrados';
  return (
    <article className="active-project-card">
      <button type="button" className="active-project-card__hitarea" aria-label={`Abrir proyecto ${project.baseName}, folio ${getProjectSequence(project)}`} onClick={() => onOpen(project.id)} />
      <div className="active-project-card__heading">
        <span className="active-project-card__icon"><FolderOpen size={20} /></span>
        <span className="active-project-card__folio">Folio #{getProjectSequence(project)}</span>
        <StatusBadge kind="project" value={project.status} />
      </div>
      <h3>{project.baseName}</h3>
      <p className="active-project-card__client">{project.client} <span>· {project.department}</span></p>
      <p className="active-project-card__reference"><span>Referencia</span>{project.structuredName || "Sin referencia asignada"}</p>
      {assignedEngineerName && <p className="active-project-card__engineer"><User size={13} /><span>{assignedEngineerName}</span></p>}
      <div className="active-project-card__workflow">
        <div className="active-project-card__tags"><span>{project.type} · {PROJECT_TYPE_LABELS[project.type]}</span><PriorityBadge priority={project.priority} /></div>
        <ProjectPhaseSteps project={project} onSelect={phase => onOpenPhase?.(project.id, phase)} />
      </div>
      <div className="active-project-card__statuses">
        <StatusBadge kind="payment" value={project.paymentStatus} />
        {isInactive && <span className="active-project-card__inactive" title="14 días o más sin actualización"><Clock3 size={12} />Sin actividad</span>}
        {showNewBadge && isNewItem(project.createdAt) && <span className="active-project-card__new">Nuevo</span>}
      </div>
      <dl className="active-project-card__dates">
        <div><dt>Fecha compromiso</dt><dd>{formatOptionalDate(project.commitmentDate)}</dd></div>
        <div><dt>Agregado</dt><dd>{formatDate(project.createdAt)}</dd></div>
      </dl>
      <p className="active-project-card__missing">{missingLabel}</p>
      <footer>
        <span className="active-project-card__updated"><Clock3 size={14} />Actualizado el {formatDate(project.updatedAt)}</span>
      </footer>
    </article>
  );
}
