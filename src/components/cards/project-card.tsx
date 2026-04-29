import { ArrowUpRight, CalendarClock, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/common/priority-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { ProjectItem, PriorityLevel } from "@/types";
import { daysSince, formatDate, formatOptionalDate, isNewItem } from "@/lib/utils";

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
}

export function ProjectCard({ project, onOpen, showNewBadge = false }: ProjectCardProps): JSX.Element {
  const isInactive = daysSince(project.updatedAt) >= 14;
  const showNew = showNewBadge && isNewItem(project.createdAt);
  const spent = project.expenses.reduce((total, expense) => total + expense.monto, 0);
  const remaining = project.totalContratado - spent;
  const costRatio = project.totalContratado > 0 ? spent / project.totalContratado : 0;
  const mxn = (value: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value);

  return (
    <Card
      className={`group flex h-full cursor-pointer flex-col gap-4 border-white/[0.07] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:bg-[#2B2B2F] hover:shadow-card-hover sm:p-5 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.75fr)_auto] lg:items-center ${priorityAccent[project.priority]}`}
      onClick={() => onOpen(project.id)}
    >
      <div className="flex items-start justify-between gap-3 lg:min-w-0">
        <div className="min-w-0 space-y-2">
          <p className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-accent">
            {project.client} · {project.department}
          </p>
          <div>
            <h3 className="line-clamp-2 text-[17px] font-bold leading-snug text-foreground lg:truncate">{project.baseName}</h3>
            <p className="mt-0.5 text-xs text-[#888888]">{project.structuredName}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 lg:hidden">
          {showNew ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-900/40 px-3 py-1 text-xs font-bold text-blue-400 ring-1 ring-blue-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              Nuevo
            </span>
          ) : null}
          <PriorityBadge priority={project.priority} />
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

      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-[#1F1F22]/70 p-3 text-sm lg:grid-cols-4 lg:bg-transparent lg:p-0">
        <Metric label="Contratado" value={mxn(project.totalContratado)} />
        <Metric label="Gastado" value={mxn(spent)} />
        <Metric label="Disponible" value={mxn(remaining)} tone={remaining < 0 ? "danger" : "default"} />
        <Metric label="Costo" value={`${Math.round(costRatio * 100)}%`} tone={costRatio >= 0.85 ? "warning" : "default"} />
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

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "danger";
}): JSX.Element {
  const valueClass = tone === "danger" ? "text-danger" : tone === "warning" ? "text-[#F5A524]" : "text-foreground";

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#888888]">
        {label === "Contratado" ? <DollarSign className="h-3 w-3" /> : null}
        {label}
      </div>
      <p className={`mt-1 truncate text-sm font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}
