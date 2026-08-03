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
  "en-programacion":      "bg-[#3F3F46] text-[#888888]",
  "en-concurso":          "bg-blue-900/40 text-blue-400 ring-1 ring-blue-500/30",
  "in-progress":          "bg-secondary/15 text-secondary ring-1 ring-secondary/30",
  "pendiente-aprobacion": "bg-[#F5A524]/15 text-[#F5A524] ring-1 ring-[#F5A524]/30",
  "pendiente-autorizar":  "bg-[#F5A524]/15 text-[#F5A524] ring-1 ring-[#F5A524]/30",
  reasignado:             "bg-purple-900/40 text-purple-400 ring-1 ring-purple-500/30",
  "cierre-por-sistema":   "bg-[#3F3F46] text-[#888888]",
  comparativa:            "bg-blue-900/40 text-blue-400 ring-1 ring-blue-500/30",
  "no-autorizado":        "bg-[#E24B4A]/15 text-[#E24B4A] ring-1 ring-[#E24B4A]/30",
  completed:              "bg-[#2DBE7A]/15 text-[#2DBE7A] ring-1 ring-[#2DBE7A]/30",
  cancelled:              "bg-[#3F3F46] text-[#71717A]",
  // request
  "under-review":       "bg-[#F5A524]/15 text-[#F5A524] ring-1 ring-[#F5A524]/30",
  "needs-correction":   "bg-[#F5A524]/15 text-[#F5A524] ring-1 ring-[#F5A524]/30",
  rejected:             "bg-[#E24B4A]/15 text-[#E24B4A] ring-1 ring-[#E24B4A]/30",
  approved:             "bg-[#2DBE7A]/15 text-[#2DBE7A] ring-1 ring-[#2DBE7A]/30",
  // payment
  unpaid:               "bg-[#E24B4A]/15 text-[#E24B4A] ring-1 ring-[#E24B4A]/30",
  partial:              "bg-[#F5A524]/15 text-[#F5A524] ring-1 ring-[#F5A524]/30",
  paid:                 "bg-[#2DBE7A]/15 text-[#2DBE7A] ring-1 ring-[#2DBE7A]/30",
  // invoice
  solicitada: "bg-[#F5A524]/15 text-[#F5A524] ring-1 ring-[#F5A524]/30",
  recibida:   "bg-blue-900/40 text-blue-400 ring-1 ring-blue-500/30",
  "en-portal":"bg-purple-900/40 text-purple-400 ring-1 ring-purple-500/30",
  enviada:    "bg-secondary/15 text-secondary ring-1 ring-secondary/30",
  pagada:     "bg-[#2DBE7A]/15 text-[#2DBE7A] ring-1 ring-[#2DBE7A]/30",
  cancelada:  "bg-[#3F3F46] text-[#71717A]",
};

const dotMap: Record<string, string> = {
  "en-programacion":      "bg-[#71717A]",
  "en-concurso":          "bg-blue-400",
  "in-progress":          "bg-secondary",
  "pendiente-aprobacion": "bg-[#F5A524]",
  "pendiente-autorizar":  "bg-[#F5A524]",
  reasignado:             "bg-purple-400",
  "cierre-por-sistema":   "bg-[#888888]",
  comparativa:            "bg-blue-400",
  "no-autorizado":        "bg-[#E24B4A]",
  completed:              "bg-[#2DBE7A]",
  cancelled:              "bg-[#71717A]",
  "under-review":         "bg-[#F5A524]",
  "needs-correction":     "bg-[#F5A524]",
  rejected:               "bg-[#E24B4A]",
  approved:               "bg-[#2DBE7A]",
  unpaid:                 "bg-[#E24B4A]",
  partial:                "bg-[#F5A524]",
  paid:                   "bg-[#2DBE7A]",
  solicitada:             "bg-[#F5A524]",
  recibida:               "bg-blue-400",
  "en-portal":            "bg-purple-400",
  enviada:                "bg-secondary",
  pagada:                 "bg-[#2DBE7A]",
  cancelada:              "bg-[#71717A]",
};

export function StatusBadge({ kind, value }: StatusBadgeProps): JSX.Element {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", toneMap[value] ?? "bg-[#3F3F46] text-[#888888]")}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotMap[value] ?? "bg-[#888888]")} />
      {labelMap[kind][value] ?? value}
    </span>
  );
}
