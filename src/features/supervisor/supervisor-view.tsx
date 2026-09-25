import { BadgeCheck, BadgeDollarSign, ChevronDown, DollarSign, FileText, FolderOpenDot, LayoutGrid, LayoutList, Plus, ShieldAlert, Trash2, Wrench } from "lucide-react";
import { ComponentType, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { SectionTitle } from "@/components/layout/section-title";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ProjectCard } from "@/components/cards/project-card";
import { AdminReviewCard } from "@/components/cards/admin-review-card";
import { Button } from "@/components/ui/button";
import { ProjectCalendar } from "@/components/common/project-calendar";
import { ProjectItem, RequestItem, UserItem } from "@/types";
import { StatusBadge } from "@/components/common/status-badge";
import { cn, getProjectSequence, getRequestSequence, getRequestSequenceNumber } from "@/lib/utils";

const STATUS_DISPLAY: Record<string, string> = {
  "en-programacion": "En programación",
  "in-progress": "En proceso",
  "en-concurso": "En concurso",
  "pendiente-aprobacion": "Pend. aprobación",
  "pendiente-autorizar": "Pend. autorizar",
  "reasignado": "Reasignado",
  "comparativa": "Comparativa",
  "cierre-por-sistema": "Cierre por sistema",
  "no-autorizado": "No autorizado",
  "completed": "Terminado",
  "cancelled": "Cancelado",
};
const PRIORITY_DISPLAY: Record<string, string> = { low: "Bajo", medium: "Medio", high: "Alto", critical: "Crítica" };
const FOTOS_DISPLAY: Record<string, string> = { no: "No", "en-revision": "En revisión", si: "Si", rechazado: "Rechazado" };
// Mismos 4 estados que Fotos — ligado a reporteFileStatus de Fase 2 ("Reporte generado").
const REPORTE_DISPLAY: Record<string, string> = { no: "No", "en-revision": "En revisión", si: "Si", rechazado: "Rechazado" };
const SUBFACT_DISPLAY: Record<string, string> = { Pendiente: "No pagado", Pagado: "Pagado" };
// Mismas etiquetas que en Fase 4 del proyecto — igual que en admin-view.tsx, para que Admin y
// Supervisor cuenten con exactamente los mismos filtros.
const MDP_OPTIONS = ["Todos", "Sin Definir", "PPD", "PUE"];
const FORMAPAGO_OPTIONS = ["Todos", "Sin definir", "Efectivo", "Transferencia", "Cheque"];
// "Pago" (filtro financiero) usa el mismo dato que "estatus pago final" de Fase 4 — no
// existe "pago parcial" en este filtro, solo Pendiente/Pagado.
const PAGOFINAL_DISPLAY: Record<string, string> = { Pendiente: "No pagado", Pagado: "Pagado" };

export type SupervisorTab = "all" | "open" | "closed" | "calendar" | "requests";
type ViewMode = "cards" | "table";

interface SupervisorViewProps {
  tab: SupervisorTab;
  onTabChange: (tab: SupervisorTab) => void;
  activeUserName: string;
  projects: ProjectItem[];
  requests: RequestItem[];
  users: UserItem[];
  onOpenProject: (projectId: string) => void;
  onOpenRequest?: (requestId: string) => void;
  onOpenNewRequest?: () => void;
}

const ACTIVE_STATUSES_SUP = ["en-programacion", "en-concurso", "in-progress", "pendiente-aprobacion", "pendiente-autorizar", "reasignado", "comparativa"];

export function SupervisorView({ tab, onTabChange, activeUserName, projects, requests, users, onOpenProject, onOpenRequest, onOpenNewRequest }: SupervisorViewProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("Todos");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [departmentFilter, setDepartmentFilter] = useState("Todos");
  const [urgencyFilter, setUrgencyFilter] = useState("Todos");
  const [engineerFilter, setEngineerFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [estimFilter, setEstimFilter] = useState("Todos");
  const [cotizFilter, setCotizFilter] = useState("Todos");
  const [payFilter, setPayFilter] = useState("Todos");
  const [fotosFilter, setFotosFilter] = useState("Todos");
  const [reporteFilter, setReporteFilter] = useState("Todos");
  const [subFilter, setSubFilter] = useState("Todos");
  const [subFacturaFilter, setSubFacturaFilter] = useState("Todos");
  const [mdpFilter, setMdpFilter] = useState("Todos");
  const [formaPagoFilter, setFormaPagoFilter] = useState("Todos");
  const [yearFilter, setYearFilter] = useState("Todos");
  const [sortFilter, setSortFilter] = useState("Reciente ↓");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  // Acordeones de filtros — cerrados por defecto, cada grupo se abre/cierra independiente.
  const [openOperativo, setOpenOperativo] = useState(false);
  const [openAdministrativo, setOpenAdministrativo] = useState(false);
  const [openFinanciero, setOpenFinanciero] = useState(false);

  // Búsqueda de solicitudes
  const [reqQuery, setReqQuery] = useState("");

  const clients = useMemo(() => ["Todos", ...new Set(projects.map((p) => p.client))], [projects]);
  const types = useMemo(() => ["Todos", ...new Set(projects.map((p) => p.type))], [projects]);
  const departments = useMemo(() => ["Todos", ...new Set(projects.map((p) => p.department))], [projects]);
  const engineers = useMemo(() => ["Todos", ...users.filter((u) => u.role === "engineer" && u.isActive !== false).map((u) => u.name)], [users]);
  const years = useMemo(() => {
    const ys = Array.from(new Set(projects.map((p) => new Date(p.createdAt).getFullYear().toString()))).sort((a, b) => b.localeCompare(a));
    return ["Todos", ...ys];
  }, [projects]);
  const statusOptions = ["Todos", ...Object.values(STATUS_DISPLAY)];
  const urgencyOptions = ["Todos", ...Object.values(PRIORITY_DISPLAY)];
  const estimOptions = ["Todos", "Pendiente", "Realizada", "Cancelada", "Comparativa", "N/A", "Sin información"];
  const cotizOptions = ["Todos", "Pendiente", "Realizada", "Enviada", "Revisión", "Cancelada", "Comparativa", "N/A", "Sin información"];
  const payOptions = ["Todos", ...Object.values(PAGOFINAL_DISPLAY)];
  const fotosOptions = ["Todos", ...Object.values(FOTOS_DISPLAY)];
  const reporteOptions = ["Todos", ...Object.values(REPORTE_DISPLAY)];
  const subOptions = ["Todos", "Sí", "No"];
  const subFacturaOptions = ["Todos", ...Object.values(SUBFACT_DISPLAY)];
  const sortOptions = ["Reciente ↓", "Antiguo ↑", "Monto ↓", "Monto ↑"];

  const filteredProjects = useMemo(() => {
    if (tab === "calendar") return projects;
    const q = query.trim().toLowerCase();
    const result = projects.filter((project) => {
      const matchesTab =
        tab === "all" ? true :
        tab === "open" ? project.status !== "completed" :
        project.status === "completed";
      if (!matchesTab) return false;
      if (yearFilter !== "Todos" && new Date(project.createdAt).getFullYear().toString() !== yearFilter) return false;
      if (q && ![project.structuredName, project.client, project.description, project.baseName, project.oc ?? ""].some((f) => f.toLowerCase().includes(q))) return false;
      if (clientFilter !== "Todos" && project.client !== clientFilter) return false;
      if (typeFilter !== "Todos" && project.type !== typeFilter) return false;
      if (departmentFilter !== "Todos" && project.department !== departmentFilter) return false;
      if (urgencyFilter !== "Todos") {
        const key = Object.keys(PRIORITY_DISPLAY).find((k) => PRIORITY_DISPLAY[k] === urgencyFilter);
        if (project.priority !== key) return false;
      }
      if (statusFilter !== "Todos") {
        const key = Object.keys(STATUS_DISPLAY).find((k) => STATUS_DISPLAY[k] === statusFilter);
        if (project.status !== key) return false;
      }
      if (engineerFilter !== "Todos") {
        const assigned = users.find((u) => u.role === "engineer" && (u.id === project.createdBy || (project.participants ?? []).includes(u.id)));
        if (!assigned || assigned.name !== engineerFilter) return false;
      }
      if (estimFilter !== "Todos" && project.estimacion !== estimFilter) return false;
      if (cotizFilter !== "Todos" && project.cotizacion !== cotizFilter) return false;
      if (payFilter !== "Todos") {
        const key = Object.keys(PAGOFINAL_DISPLAY).find((k) => PAGOFINAL_DISPLAY[k] === payFilter);
        if ((project.estatusPagoFinal ?? "Pendiente") !== key) return false;
      }
      if (fotosFilter !== "Todos") {
        const key = Object.keys(FOTOS_DISPLAY).find((k) => FOTOS_DISPLAY[k] === fotosFilter);
        const actual = project.fotosStatus ?? (project.fotos ? "si" : "no");
        if (actual !== key) return false;
      }
      if (reporteFilter !== "Todos") {
        const key = Object.keys(REPORTE_DISPLAY).find((k) => REPORTE_DISPLAY[k] === reporteFilter);
        const actual = project.reporteFileStatus ?? "no";
        if (actual !== key) return false;
      }
      if (subFilter !== "Todos" && !!project.subcontratadoActivo !== (subFilter === "Sí")) return false;
      if (subFacturaFilter !== "Todos") {
        // Solo cuenta si el subcontratado esta activo — no mezclar con proyectos sin subcontratado.
        if (!project.subcontratadoActivo) return false;
        // Pagado real: se calcula de los archivos de Subcontratados-Facturas (cada uno con su
        // propio "Pagada"/"Rechazado"/"En revisión"), no de un campo aparte — asi el filtro
        // siempre coincide con lo que se ve en la ficha del proyecto (ej. "2/2 pagadas").
        const facturasFiles = (project.files ?? []).filter((f) => f.category === "subcontratadosFacturas");
        const allPaid = facturasFiles.length > 0 && facturasFiles.every((f) => f.status === "si");
        const wantPaid = subFacturaFilter === "Pagado";
        if (allPaid !== wantPaid) return false;
      }
      if (mdpFilter !== "Todos") {
        const pagos = project.pagosProyecto ?? [];
        if (!pagos.some((pg) => (mdpFilter === "Sin Definir" ? !pg.mdp : pg.mdp === mdpFilter))) return false;
      }
      if (formaPagoFilter !== "Todos") {
        const pagos = project.pagosProyecto ?? [];
        if (!pagos.some((pg) => (formaPagoFilter === "Sin definir" ? !pg.formaPago : pg.formaPago === formaPagoFilter))) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      switch (sortFilter) {
        case "Antiguo ↑": return a.createdAt.localeCompare(b.createdAt);
        case "Monto ↓": return (b.totalSinIva ?? 0) - (a.totalSinIva ?? 0);
        case "Monto ↑": return (a.totalSinIva ?? 0) - (b.totalSinIva ?? 0);
        default: return b.createdAt.localeCompare(a.createdAt);
      }
    });
    return result;
  }, [clientFilter, departmentFilter, projects, query, tab, typeFilter, urgencyFilter, engineerFilter, statusFilter, estimFilter, cotizFilter, payFilter, fotosFilter, reporteFilter, subFilter, subFacturaFilter, mdpFilter, formaPagoFilter, yearFilter, sortFilter, users]);

  const hasFilters = !!(query || yearFilter !== "Todos" || clientFilter !== "Todos" || typeFilter !== "Todos" || departmentFilter !== "Todos" || urgencyFilter !== "Todos" || engineerFilter !== "Todos" || statusFilter !== "Todos" || estimFilter !== "Todos" || cotizFilter !== "Todos" || payFilter !== "Todos" || fotosFilter !== "Todos" || reporteFilter !== "Todos" || subFilter !== "Todos" || subFacturaFilter !== "Todos" || mdpFilter !== "Todos" || formaPagoFilter !== "Todos");

  const clearFilters = (): void => {
    setQuery(""); setYearFilter("Todos"); setClientFilter("Todos"); setTypeFilter("Todos"); setDepartmentFilter("Todos");
    setUrgencyFilter("Todos"); setEngineerFilter("Todos"); setStatusFilter("Todos");
    setEstimFilter("Todos"); setCotizFilter("Todos"); setPayFilter("Todos"); setFotosFilter("Todos"); setReporteFilter("Todos");
    setSubFilter("Todos"); setSubFacturaFilter("Todos"); setMdpFilter("Todos"); setFormaPagoFilter("Todos");
  };

  const summary = useMemo(() => ({
    porRevisar: requests.filter((r) => r.status === "under-review").length,
    activos: projects.filter((p) => ACTIVE_STATUSES_SUP.includes(p.status)).length,
    // Mismo campo que el filtro "Pago" (estatusPagoFinal, Fase 4) — igual que en Admin, para
    // que la tarjeta y el filtro al que te lleva siempre coincidan. Antes usaba paymentStatus
    // ("unpaid" exacto), que ademas dejaba "parcial" sin contar en ninguna de las 2 tarjetas.
    noPagados: projects.filter((p) => p.estatusPagoFinal !== "Pagado").length,
    pagados: projects.filter((p) => p.estatusPagoFinal === "Pagado").length,
  }), [projects, requests]);

  const filteredRequestsList = useMemo(() => {
    const q = reqQuery.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) =>
      [r.baseName, r.client, getRequestSequence(r, projects)].some((f) => f.toLowerCase().includes(q)),
    );
  }, [requests, projects, reqQuery]);

  const sortedRequests = useMemo(() => {
    return [...filteredRequestsList].sort((a, b) => {
      const diff = getRequestSequenceNumber(b, projects) - getRequestSequenceNumber(a, projects);
      return diff !== 0 ? diff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [filteredRequestsList, projects]);

  return (
    <section className="space-y-6">
      <SectionTitle
        eyebrow={`Espacio de trabajo de ${activeUserName}`}
        title="Seguimiento ejecutivo de proyectos"
        actions={
          onOpenNewRequest ? (
            <Button onClick={onOpenNewRequest} variant="accent">
              <Plus className="h-4 w-4" />
              Nueva solicitud
            </Button>
          ) : null
        }
      />

      {/* ── Cards de resumen ejecutivo ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "Por revisar", value: summary.porRevisar, icon: ShieldAlert,
            border: "border-[#F5A524]/20", iconBg: "bg-[#F5A524]/15 text-[#F5A524]", labelColor: "text-[#F5A524]", accent: "bg-warning",
            onClick: () => onTabChange("requests"),
          },
          {
            title: "Proyectos activos", value: summary.activos, icon: FolderOpenDot,
            border: "border-secondary/20", iconBg: "bg-secondary/15 text-secondary", labelColor: "text-secondary", accent: "bg-secondary",
            onClick: () => onTabChange("open"),
          },
          {
            title: "Pagados", value: summary.pagados, icon: BadgeCheck,
            border: "border-[#2DBE7A]/20", iconBg: "bg-[#2DBE7A]/15 text-[#2DBE7A]", labelColor: "text-[#2DBE7A]", accent: "bg-[#2DBE7A]",
            onClick: () => { onTabChange("all"); setPayFilter("Pagado"); },
          },
          {
            title: "No pagados", value: summary.noPagados, icon: BadgeDollarSign,
            border: "border-danger/20", iconBg: "bg-danger/15 text-danger", labelColor: "text-danger", accent: "bg-danger",
            onClick: () => { onTabChange("all"); setPayFilter("No pagado"); },
          },
        ].map((card) => (
          <Card
            key={card.title}
            onClick={card.onClick}
            className={cn(
              "relative overflow-hidden border bg-gradient-to-br from-[#2C2C30] to-[#212124] ring-1 ring-inset ring-white/[0.04] transition-all duration-200",
              card.border,
              "cursor-pointer hover:-translate-y-0.5 hover:border-opacity-70 hover:shadow-card-hover",
            )}
          >
            <div className={`absolute left-0 top-0 h-full w-1 ${card.accent}`} />
            <div className="flex items-start justify-between gap-3 pl-3">
              <div className="flex-1">
                <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${card.labelColor}`}>{card.title}</p>
                <p className="mt-3 text-4xl font-bold tabular-nums text-foreground">{card.value}</p>
              </div>
              <div className={`rounded-2xl p-3 ring-1 ring-inset ring-white/10 ${card.iconBg}`}><card.icon className="h-6 w-6" /></div>
            </div>
          </Card>
        ))}
      </div>

      <Tabs
        value={tab}
        onValueChange={onTabChange}
        options={[
          { key: "all", label: "Todos", count: projects.length },
          { key: "open", label: "No concluidos", count: projects.filter((p) => p.status !== "completed").length },
          { key: "closed", label: "Concluidos", count: projects.filter((p) => p.status === "completed").length },
          {
            key: "calendar",
            label: "Calendario",
            count: projects.reduce((t, p) => t + (p.commitmentDate ? 1 : 0) + (p.importantDates?.length ?? 0), 0),
          },
          { key: "requests", label: "Solicitudes", count: requests.length },
        ]}
      />

      {/* ── Proyectos (todos / abiertos / cerrados) ── */}
      {(tab === "all" || tab === "open" || tab === "closed") ? (
        <>
          {/* Toolbar compacta */}
          <div className="flex flex-col gap-3 rounded-[24px] border border-[#3F3F46] bg-[#27272A] p-4 shadow-soft sm:p-5">
            <div className="flex items-center gap-3">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Busca un proyecto"
                className="flex-1 h-10"
              />
              {/* Vista toggle */}
              <div className="flex rounded-xl border border-[#3F3F46] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm transition",
                    viewMode === "cards" ? "bg-accent text-[#111111]" : "text-[#888888] hover:text-foreground",
                  )}
                  aria-label="Vista tarjetas"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm border-l border-[#3F3F46] transition",
                    viewMode === "table" ? "bg-accent text-[#111111]" : "text-[#888888] hover:text-foreground",
                  )}
                  aria-label="Vista tabla"
                >
                  <LayoutList className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Pills de año */}
            <div className="flex flex-wrap gap-1.5">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYearFilter(y)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold transition",
                    yearFilter === y
                      ? "bg-accent text-[#111111]"
                      : "bg-[#3F3F46] text-[#A1A1AA] hover:bg-[#52525B] hover:text-foreground",
                  )}
                >{y}</button>
              ))}
            </div>
            {/* Operativo (Fase 1/2) — lo que ve tambien el ingeniero dia a dia */}
            <FilterGroupAccordion variant="operativo" icon={Wrench} label="Operativo" open={openOperativo} onToggle={() => setOpenOperativo((o) => !o)}>
              <CompactSelect layout="cell" variant="operativo" label="Cliente" options={clients} value={clientFilter} onChange={setClientFilter} />
              <CompactSelect layout="cell" variant="operativo" label="Depto." options={departments} value={departmentFilter} onChange={setDepartmentFilter} />
              <CompactSelect layout="cell" variant="operativo" label="Tipo" options={types} value={typeFilter} onChange={setTypeFilter} />
              <CompactSelect layout="cell" variant="operativo" label="Urgencia" options={urgencyOptions} value={urgencyFilter} onChange={setUrgencyFilter} />
              <CompactSelect layout="cell" variant="operativo" label="Ingeniero" options={engineers} value={engineerFilter} onChange={setEngineerFilter} />
              <CompactSelect layout="cell" variant="operativo" label="Estado" options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
            </FilterGroupAccordion>
            {/* Administrativo — revisiones de archivo por sección, no dinero */}
            <FilterGroupAccordion variant="administrativo" icon={FileText} label="Administrativo" open={openAdministrativo} onToggle={() => setOpenAdministrativo((o) => !o)}>
              <CompactSelect layout="cell" variant="administrativo" label="Estimación" options={estimOptions} value={estimFilter} onChange={setEstimFilter} />
              <CompactSelect layout="cell" variant="administrativo" label="Cotización" options={cotizOptions} value={cotizFilter} onChange={setCotizFilter} />
              <CompactSelect layout="cell" variant="administrativo" label="Fotos" options={fotosOptions} value={fotosFilter} onChange={setFotosFilter} />
              <CompactSelect layout="cell" variant="administrativo" label="Reporte" options={reporteOptions} value={reporteFilter} onChange={setReporteFilter} />
              <CompactSelect layout="cell" variant="administrativo" label="Subcontratados" options={subOptions} value={subFilter} onChange={setSubFilter} />
            </FilterGroupAccordion>
            {/* Financiero — dinero: pagos, facturas, MDP */}
            <FilterGroupAccordion variant="finance" icon={DollarSign} label="Financiero" open={openFinanciero} onToggle={() => setOpenFinanciero((o) => !o)}>
              <CompactSelect layout="cell" variant="finance" label="Pago" options={payOptions} value={payFilter} onChange={setPayFilter} />
              <CompactSelect layout="cell" variant="finance" label="Facturas subcont." options={subFacturaOptions} value={subFacturaFilter} onChange={setSubFacturaFilter} />
              <CompactSelect layout="cell" variant="finance" label="MDP" options={MDP_OPTIONS} value={mdpFilter} onChange={setMdpFilter} />
              <CompactSelect layout="cell" variant="finance" label="Forma de pago" options={FORMAPAGO_OPTIONS} value={formaPagoFilter} onChange={setFormaPagoFilter} />
            </FilterGroupAccordion>
            {/* Pie: contador + Ordenar + Limpiar filtros */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-[#888888]">
                Mostrando {filteredProjects.length} de {projects.filter((p) => tab === "all" ? true : tab === "open" ? p.status !== "completed" : p.status === "completed").length} proyecto{projects.length !== 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <CompactSelect label="Ordenar" options={sortOptions} value={sortFilter} onChange={setSortFilter} />
                {hasFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 rounded-xl border border-[#3F3F46] bg-[#313136] px-3 py-1.5 text-xs font-semibold text-[#A1A1AA] transition hover:border-danger/40 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Limpiar filtros
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Resultados */}
          {viewMode === "cards" ? (
            <div className="space-y-3">
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} onOpen={onOpenProject} />
              ))}
              {filteredProjects.length === 0 && (
                <p className="py-10 text-center text-sm text-[#888888]">Sin proyectos para los filtros seleccionados</p>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-[#3F3F46] bg-[#27272A] shadow-soft">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#3F3F46] text-xs font-semibold uppercase tracking-[0.14em] text-[#888888]">
                      <th className="px-5 py-3 text-left">Folio</th>
                      <th className="px-5 py-3 text-left">Nombre</th>
                      <th className="px-5 py-3 text-left">Cliente</th>
                      <th className="px-5 py-3 text-left">Tipo</th>
                      <th className="px-5 py-3 text-left">Estado</th>
                      <th className="px-5 py-3 text-left">Pago</th>
                      <th className="px-5 py-3 text-left">Compromiso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#3F3F46]">
                    {filteredProjects.map((project) => {
                      const seq = getProjectSequence(project);
                      return (
                        <tr
                          key={project.id}
                          className="cursor-pointer transition hover:bg-[#313136]"
                          onClick={() => onOpenProject(project.id)}
                        >
                          <td className="px-5 py-3 font-mono text-xs text-accent">{seq}</td>
                          <td className="px-5 py-3 font-medium text-foreground max-w-[220px] truncate">{project.baseName}</td>
                          <td className="px-5 py-3 text-[#A1A1AA] max-w-[120px] truncate">{project.client}</td>
                          <td className="px-5 py-3 text-[#888888]">{project.type}</td>
                          <td className="px-5 py-3"><StatusBadge kind="project" value={project.status} /></td>
                          <td className="px-5 py-3"><StatusBadge kind="payment" value={project.paymentStatus} /></td>
                          <td className="px-5 py-3 text-[#888888]">
                            {project.commitmentDate
                              ? new Date(project.commitmentDate).toLocaleDateString("es-MX")
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredProjects.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-10 text-center text-sm text-[#888888]">
                          Sin resultados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}

      {tab === "calendar" ? (
        <ProjectCalendar projects={projects} onOpenProject={onOpenProject} users={users} showSideList />
      ) : null}

      {/* ── Solicitudes — mismo formato de tarjeta que Administración, en solo lectura ── */}
      {tab === "requests" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-bold text-foreground">Todas las solicitudes</h3>
            <div className="flex items-center gap-3">
              <Input
                value={reqQuery}
                onChange={(e) => setReqQuery(e.target.value)}
                placeholder="Buscar por N° proyecto, nombre o cliente…"
                className="h-9 w-72"
              />
              <span className="shrink-0 rounded-full bg-[#3F3F46] px-3 py-1 text-xs font-semibold text-[#A1A1AA]">Solo lectura</span>
            </div>
          </div>
          {sortedRequests.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-[#3F3F46] py-16 text-center">
              <p className="text-sm font-semibold text-[#888888]">
                {requests.length === 0 ? "No hay solicitudes registradas" : "Sin resultados para la búsqueda"}
              </p>
            </div>
          ) : (
            <div className="card-grid">
              {sortedRequests.map((req) => (
                <AdminReviewCard
                  key={req.id}
                  request={req}
                  onOpen={(id) => onOpenRequest?.(id)}
                  requesterName={users.find((user) => user.id === req.createdBy)?.name}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

    </section>
  );
}

type FilterGroupVariant = "default" | "operativo" | "administrativo" | "finance";

// Cada grupo lleva un tinte permanente — dorado (Operativo), morado (Administrativo),
// azul (Financiero) — visible este o no seleccionado. "default" ya solo lo usa "Ordenar".
// Clases completas y literales (no interpoladas) para que Tailwind las detecte al compilar.
function filterBorderBg(variant: FilterGroupVariant, isActive: boolean): string {
  if (variant === "finance") {
    return isActive
      ? "border-[#3B82F6]/60 bg-gradient-to-b from-[#3B82F6]/25 to-[#3B82F6]/10 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]"
      : "border-[#3B82F6]/30 bg-gradient-to-b from-[#3B82F6]/10 to-[#3B82F6]/[0.03] hover:border-[#3B82F6]/50";
  }
  if (variant === "administrativo") {
    return isActive
      ? "border-[#8B5CF6]/60 bg-gradient-to-b from-[#8B5CF6]/25 to-[#8B5CF6]/10 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]"
      : "border-[#8B5CF6]/30 bg-gradient-to-b from-[#8B5CF6]/10 to-[#8B5CF6]/[0.03] hover:border-[#8B5CF6]/50";
  }
  if (variant === "operativo") {
    return isActive
      ? "border-[#F5A524]/60 bg-gradient-to-b from-[#F5A524]/25 to-[#F5A524]/10 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]"
      : "border-[#F5A524]/30 bg-gradient-to-b from-[#F5A524]/10 to-[#F5A524]/[0.03] hover:border-[#F5A524]/50";
  }
  return isActive
    ? "border-accent/40 bg-gradient-to-b from-accent/20 to-accent/5 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]"
    : "border-[#3F3F46] bg-gradient-to-b from-[#38383D] to-[#2C2C30] hover:border-white/20 hover:from-[#3D3D42]";
}
function filterLabelText(variant: FilterGroupVariant, isActive: boolean): string {
  if (variant === "finance") return isActive ? "text-[#93C5FD]" : "text-[#60A5FA]";
  if (variant === "administrativo") return isActive ? "text-[#C4B5FD]" : "text-[#A78BFA]";
  if (variant === "operativo") return isActive ? "text-[#FDE68A]" : "text-[#E3A94F]";
  return isActive ? "text-accent" : "text-[#888888]";
}
function filterValueText(variant: FilterGroupVariant, isActive: boolean): string {
  if (variant === "finance") return isActive ? "text-[#BFDBFE]" : "text-[#93C5FD]";
  if (variant === "administrativo") return isActive ? "text-[#DDD6FE]" : "text-[#C4B5FD]";
  if (variant === "operativo") return isActive ? "text-[#FEF3C7]" : "text-[#FCD34D]";
  return isActive ? "text-accent" : "text-foreground";
}
// Ícono de cabecera del acordeón — color solido (no tinte), para que resalte sobre el fondo.
function filterHeaderIconBg(variant: FilterGroupVariant): string {
  if (variant === "finance") return "bg-[#3B82F6]";
  if (variant === "administrativo") return "bg-[#8B5CF6]";
  if (variant === "operativo") return "bg-[#F5A524]";
  return "bg-[#3F3F46]";
}
function filterHeaderChevronBg(variant: FilterGroupVariant): string {
  if (variant === "finance") return "bg-[#3B82F6]/20 text-[#60A5FA]";
  if (variant === "administrativo") return "bg-[#8B5CF6]/20 text-[#A78BFA]";
  if (variant === "operativo") return "bg-[#F5A524]/20 text-[#E3A94F]";
  return "bg-[#3F3F46] text-[#888888]";
}

// Acordeón de filtros — cabecera con ícono representativo del grupo, cerrado por
// defecto; al abrir muestra sus CompactSelect (layout="cell") en cuadrícula.
function FilterGroupAccordion({
  variant, icon: Icon, label, open, onToggle, children,
}: {
  variant: FilterGroupVariant;
  icon: ComponentType<{ className?: string }>;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className={`rounded-2xl border transition-colors duration-150 ${filterBorderBg(variant, open)}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${filterHeaderIconBg(variant)}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="h-6 w-px shrink-0 bg-white/10" />
        <span className="flex-1 text-sm font-bold text-foreground">{label}</span>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform duration-200 ${filterHeaderChevronBg(variant)} ${open ? "rotate-180" : ""}`}>
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
      {open ? (
        <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] p-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function CompactSelect({ label, options, value, onChange, variant = "default", layout = "pill" }: { label: string; options: string[]; value: string; onChange: (v: string) => void; variant?: FilterGroupVariant; layout?: "pill" | "cell" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = value !== options[0];

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${layout === "cell" ? "w-full" : ""}`}>
      {layout === "cell" ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-all duration-150 ${filterBorderBg(variant, isActive)}`}
        >
          <span className="min-w-0 flex-1">
            <span className={`block text-[9px] font-bold uppercase tracking-[0.12em] ${filterLabelText(variant, isActive)}`}>{label}</span>
            <span className={`block truncate text-sm font-bold ${filterValueText(variant, isActive)}`}>{value}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""} ${filterLabelText(variant, isActive)}`} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 transition-all duration-150 ${filterBorderBg(variant, isActive)}`}
        >
          <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${filterLabelText(variant, isActive)}`}>{label}</span>
          <span className={`max-w-[140px] truncate text-xs font-semibold ${filterValueText(variant, isActive)}`}>{value}</span>
          <ChevronDown className={`h-3 w-3 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""} ${filterLabelText(variant, isActive)}`} />
        </button>
      )}

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1.5 max-h-60 min-w-[160px] overflow-y-auto rounded-2xl border border-[#3F3F46] bg-[#1E1E20] p-1.5 shadow-xl">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors ${
                opt === value
                  ? "bg-accent/15 text-accent"
                  : "text-[#A1A1AA] hover:bg-[#313136] hover:text-foreground"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
