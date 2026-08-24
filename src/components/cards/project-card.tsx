import { ArrowUpRight, CalendarClock, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/common/priority-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { ProjectItem, PriorityLevel, PROJECT_TYPE_LABELS } from "@/types";
import { daysSince, formatDate, formatOptionalDate, isNewItem, isProjectF1Complete, isProjectF2Complete } from "@/lib/utils";

const priorityAccent: Record<PriorityLevel, string> = {
  critical: "accent-critical",
  high: "accent-high",
  medium: "accent-medium",
  low: "accent-low",
};

interface ProjectCardProps {
  project: ProjectItem;
  onOpen: (projectId: string) => void;
  showNewBadge?: boolean;
  assignedEngineerName?: string;
}

export function ProjectCard({ project, onOpen, showNewBadge = false, assignedEngineerName }: ProjectCardProps): JSX.Element {
  const isInactive = daysSince(project.updatedAt) >= 14;
  const showNew = showNewBadge && isNewItem(project.createdAt);
  const consecutivo = project.structuredName.split("-")[0];

  // F1-F4 phase completion indicators — mismos campos requeridos que el indicador rojo/verde del diálogo
  const phases = [
    { label: "F1", done: isProjectF1Complete(project) },
    { label: "F2", done: isProjectF2Complete(project) },
    { label: "F3", done: !!(project.totalSinIva && project.totalSinIva > 0) },
    { label: "F4", done: !!(project.pagosProyecto?.length) },
  ];

  return (
    <Card
      className={`group flex h-full cursor-pointer flex-col gap-4 border-white/[0.07] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:bg-[#2B2B2F] hover:shadow-card-hover sm:p-5 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${priorityAccent[project.priority]}`}
      onClick={() => onOpen(project.id)}
    >
      <div className="flex items-start justify-between gap-3 lg:min-w-0">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-black text-accent">#{consecutivo}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">
              {project.client} · {project.department}
            </span>
            <span className="rounded-md bg-[#3F3F46]/80 px-1.5 py-0.5 text-[10px] font-bold text-[#A1A1AA]">
              {project.type} · {PROJECT_TYPE_LABELS[project.type]}
            </span>
          </div>
          <div>
            <h3 className="line-clamp-2 text-[17px] font-bold leading-snug text-foreground lg:truncate">{project.baseName}</h3>
            <p className="mt-0.5 text-xs text-[#888888]">{project.structuredName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={project.priority} />
            {assignedEngineerName ? (
              <div className="flex items-center gap-1.5 text-xs text-[#888888]">
                <User className="h-3 w-3 shrink-0" />
                {assignedEngineerName}
              </div>
            ) : null}
          </div>
          {/* F1-F4 progress */}
          <div className="flex items-center gap-1.5">
            {phases.map((ph) => (
              <span
                key={ph.label}
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  ph.done
                    ? "bg-accent/15 text-accent"
                    : "bg-[#3F3F46]/60 text-[#52525B]"
                }`}
              >
                {ph.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {showNew ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-900/40 px-3 py-1 text-xs font-bold text-blue-400 ring-1 ring-blue-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              Nuevo
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:hidden">
        <StatusBadge kind="project" value={project.status} />
        <StatusBadge kind="payment" value={project.paymentStatus} />
        {isInactive ? (
          <span
            title="Más de 14 días sin movimiento"
            aria-label="Más de 14 días sin movimiento"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#F5A524]/15 px-3 py-1 text-xs font-semibold text-[#F5A524] ring-1 ring-[#F5A524]/25"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#F5A524]" />
            Sin actividad
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col gap-4 border-t border-white/[0.07] pt-4 sm:flex-row sm:items-end sm:justify-between lg:mt-0 lg:border-t-0 lg:pt-0">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#888888]">
            <CalendarClock className="h-3.5 w-3.5" />
            Compromiso
          </div>
          <p className="text-sm font-bold text-foreground">{formatOptionalDate(project.commitmentDate)}</p>
          <p className="text-xs text-[#888888]">Agregado: {formatDate(project.createdAt)}</p>
        </div>
        <Button
          variant="outline"
          className="w-full sm:w-auto lg:h-10 lg:w-10 lg:px-0"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(project.id);
          }}
          aria-label="Ver detalle"
        >
          <span className="lg:hidden">Ver detalle</span>
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

