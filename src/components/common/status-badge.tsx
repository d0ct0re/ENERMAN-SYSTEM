import { cn } from "@/lib/utils";
import { InvoiceStatus, PaymentStatus, ProjectStatus, RequestStatus } from "@/types";

interface StatusBadgeProps {
  kind: "project" | "request" | "payment" | "invoice";
  value: ProjectStatus | RequestStatus | PaymentStatus | InvoiceStatus;
}

const labelMap: Record<StatusBadgeProps["kind"], Record<string, string>> = {
  project: {
    "en-programacion":      "En programación",
    "en-concurso":          "En concurso",
    "in-progress":          "En proceso",
    "pendiente-aprobacion": "Pend. aprobación",
    "pendiente-autorizar":  "Pend. autorizar",
    reasignado:             "Reasignado",
    "cierre-por-sistema":   "Cierre por sistema",
    comparativa:            "Comparativa",
    "no-autorizado":        "No autorizado",
    completed:              "Terminado",
    cancelled:              "Cancelado",
  },
  request: {
    "under-review":    "En revisión",
    "needs-correction":"En corrección",
    rejected:          "Rechazada",
    approved:          "Aprobada",
  },
  payment: {
    unpaid:  "No pagado",
    partial: "Pago parcial",
    paid:    "Pagado",
  },
  invoice: {
    solicitada: "Solicitada",
    recibida:   "Recibida",
    "en-portal":"En portal",
    enviada:    "Enviada",
    pagada:     "Pagada",
    cancelada:  "Cancelada",
  },
};

const toneMap: Record<string, string> = {
  // project
  "en-programacion":      "bg-border-default text-muted-foreground",
  "en-concurso":          "bg-blue-900/40 text-blue-400 ring-1 ring-blue-500/30",
  "in-progress":          "bg-secondary/15 text-secondary ring-1 ring-secondary/30",
  "pendiente-aprobacion": "bg-brand/15 text-brand ring-1 ring-brand/30",
  "pendiente-autorizar":  "bg-brand/15 text-brand ring-1 ring-brand/30",
  reasignado:             "bg-purple-900/40 text-purple-400 ring-1 ring-purple-500/30",
  "cierre-por-sistema":   "bg-border-default text-muted-foreground",
  comparativa:            "bg-blue-900/40 text-blue-400 ring-1 ring-blue-500/30",
  "no-autorizado":        "bg-danger/15 text-danger ring-1 ring-danger/30",
  completed:              "bg-success/15 text-success ring-1 ring-success/30",
  cancelled:              "bg-border-default text-ink-tertiary",
  // request
  "under-review":         "bg-brand/15 text-brand ring-1 ring-brand/30",
  "needs-correction":     "bg-brand/15 text-brand ring-1 ring-brand/30",
  rejected:               "bg-danger/15 text-danger ring-1 ring-danger/30",
  approved:               "bg-success/15 text-success ring-1 ring-success/30",
  // payment
  unpaid:                 "bg-danger/15 text-danger ring-1 ring-danger/30",
  partial:                "bg-brand/15 text-brand ring-1 ring-brand/30",
  paid:                   "bg-success/15 text-success ring-1 ring-success/30",
  // invoice
  solicitada: "bg-brand/15 text-brand ring-1 ring-brand/30",
  recibida:   "bg-blue-900/40 text-blue-400 ring-1 ring-blue-500/30",
  "en-portal":"bg-purple-900/40 text-purple-400 ring-1 ring-purple-500/30",
  enviada:    "bg-secondary/15 text-secondary ring-1 ring-secondary/30",
  pagada:     "bg-success/15 text-success ring-1 ring-success/30",
  cancelada:  "bg-border-default text-ink-tertiary",
};

const dotMap: Record<string, string> = {
  "en-programacion":      "bg-ink-tertiary",
  "en-concurso":          "bg-blue-400",
  "in-progress":          "bg-secondary",
  "pendiente-aprobacion": "bg-brand",
  "pendiente-autorizar":  "bg-brand",
  reasignado:             "bg-purple-400",
  "cierre-por-sistema":   "bg-muted-foreground",
  comparativa:            "bg-blue-400",
  "no-autorizado":        "bg-danger",
  completed:              "bg-success",
  cancelled:              "bg-ink-tertiary",
  "under-review":         "bg-brand",
  "needs-correction":     "bg-brand",
  rejected:               "bg-danger",
  approved:               "bg-success",
  unpaid:                 "bg-danger",
  partial:                "bg-brand",
  paid:                   "bg-success",
  solicitada:             "bg-brand",
  recibida:               "bg-blue-400",
  "en-portal":            "bg-purple-400",
  enviada:                "bg-secondary",
  pagada:                 "bg-success",
  cancelada:              "bg-ink-tertiary",
};

export function StatusBadge({ kind, value }: StatusBadgeProps): JSX.Element {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", toneMap[value] ?? "bg-border-default text-muted-foreground")}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotMap[value] ?? "bg-muted-foreground")} />
      {labelMap[kind][value] ?? value}
    </span>
  );
}
