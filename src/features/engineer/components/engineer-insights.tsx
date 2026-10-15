import { ArrowUpRight, CalendarDays, LayoutDashboard } from "lucide-react";
import { parseLocalDate } from "@/lib/utils";
import type { NotificationItem, ProjectItem } from "@/types";
import type { EngineerTab } from "../engineer-view";
interface Props { notifications: NotificationItem[]; onOpenNotification: (notification: NotificationItem) => void; upcoming: ProjectItem[]; onOpenProject: (id: string) => void; onTabChange: (tab: EngineerTab) => void; projectCount: number; distribution: {label: string; count: number; color: string}[]; }
export function EngineerInsights({notifications, onOpenNotification, upcoming, onOpenProject, onTabChange, projectCount, distribution}: Props): JSX.Element { return (<aside className="engineer-insights" aria-label="Resumen de trabajo">
          <section className="engineer-insight-card">
            <div id="app-activity-feed" />
          </section>
          <section className="engineer-insight-card">
            <h2><CalendarDays size={17} />Próximos compromisos</h2>
            <p className="engineer-insight-caption">Fechas asignadas a tus proyectos activos.</p>
            {upcoming.length ? upcoming.map((project) => <button className="engineer-agenda-item" key={project.id} type="button" onClick={() => onOpenProject(project.id)}><span className="engineer-agenda-date"><b>{parseLocalDate(project.commitmentDate!).getDate()}</b>{parseLocalDate(project.commitmentDate!).toLocaleDateString("es-MX", { month: "short" })}</span><span><strong>{project.baseName}</strong><small>{project.client}</small></span><ArrowUpRight size={15} /></button>) : <p className="engineer-insight-empty">Sin próximos compromisos asignados.</p>}
            <button className="engineer-text-link" type="button" onClick={() => onTabChange("calendar")}>Abrir calendario <ArrowUpRight size={14} /></button>
          </section>
          <section className="engineer-insight-card">
            <h2><LayoutDashboard size={17} />Estado de mis proyectos</h2>
            <p className="engineer-insight-caption">Distribución actual · {projectCount} proyectos</p>
            <div className="engineer-chart" role="img" aria-label={distribution.map((item) => `${item.label}: ${item.count}`).join(", ")}>
              {distribution.map((item) => <div key={item.label} className="engineer-chart-row"><span>{item.label}</span><div><i style={{ width: `${projectCount ? item.count / projectCount * 100 : 0}%`, background: item.color }} /></div><b>{item.count}</b></div>)}
            </div>
          </section>
        </aside>); }
