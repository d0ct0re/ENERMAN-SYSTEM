import type { EngineerTab } from "../engineer-view";
import { ArrowUpRight } from "lucide-react";
import "./engineer-metrics.css";
interface Props { activeCount: number; pendingCount: number; correctionCount: number; completedCount: number; onTabChange: (tab: EngineerTab) => void; }
export function EngineerMetrics({activeCount, pendingCount, correctionCount, completedCount, onTabChange}: Props): JSX.Element {
  const metrics = [
    { label: "Proyectos activos", count: activeCount, detail: "Todos los ingenieros", key: "active" as const },
    { label: "Solicitudes en revisión", count: pendingCount, detail: "Tus solicitudes", key: "requests" as const },
    { label: "En corrección", count: correctionCount, detail: "Pendientes de ajuste", key: "correction" as const },
    { label: "Proyectos terminados", count: completedCount, detail: "De tus proyectos", key: "completed" as const },
  ];
  return <div className="workspace-kpis" role="group" aria-label="Resumen de proyectos y solicitudes">
    {metrics.map(metric => <button key={metric.key} type="button" className={`workspace-kpi${metric.key === "correction" && metric.count > 0 ? " workspace-kpi--attention" : ""}`} aria-label={`${metric.label}: ${metric.count}. ${metric.detail}. Ver registros`} onClick={() => onTabChange(metric.key)}>
      <span className="workspace-kpi__label">{metric.label}</span>
      <span className="workspace-kpi__badge">{metric.key === "active" ? "Equipo" : metric.key === "requests" ? "Revisión" : metric.key === "correction" ? "Atención" : "Cerrados"}</span>
      <strong className={metric.count === 0 ? "workspace-kpi__value is-zero" : "workspace-kpi__value"}>{metric.count}</strong>
      <span className="workspace-kpi__detail">{metric.detail}<ArrowUpRight size={14} aria-hidden="true" /></span>
    </button>)}
  </div>;
}
