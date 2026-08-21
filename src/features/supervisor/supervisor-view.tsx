import { AlertTriangle, BadgeDollarSign, ChevronDown, ChevronUp, FolderOpenDot, LayoutGrid, LayoutList, ChevronsUpDown, Plus, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SectionTitle } from "@/components/layout/section-title";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ProjectCard } from "@/components/cards/project-card";
import { Button } from "@/components/ui/button";
import { ProjectCalendar } from "@/components/common/project-calendar";
import { ProjectItem, RequestItem, UserItem } from "@/types";
import { StatusBadge } from "@/components/common/status-badge";
import { cn } from "@/lib/utils";

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
const PAYMENT_DISPLAY: Record<string, string> = { unpaid: "No pagado", partial: "Pago parcial", paid: "Pagado" };
const FOTOS_DISPLAY: Record<string, string> = { no: "No", "en-revision": "En revisión", si: "Si", rechazado: "Rechazado" };

export type SupervisorTab = "open" | "closed" | "calendar" | "requests";
type ViewMode = "cards" | "table";
type SortDir = "asc" | "desc";

interface SupervisorViewProps {
  tab: SupervisorTab;
  onTabChange: (tab: SupervisorTab) => void;
  activeUserName: string;
  projects: ProjectItem[];
  requests: RequestItem[];
  users: UserItem[];
  onOpenProject: (projectId: string) => void;
  onOpenNewRequest?: () => void;
}

const ACTIVE_STATUSES_SUP = ["en-programacion", "en-concurso", "in-progress", "pendiente-aprobacion", "pendiente-autorizar", "reasignado", "comparativa"];

export function SupervisorView({ tab, onTabChange, activeUserName, projects, requests, users, onOpenProject, onOpenNewRequest }: SupervisorViewProps): JSX.Element {
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
  const [yearFilter, setYearFilter] = useState("Todos");
  const [sortFilter, setSortFilter] = useState("Reciente ↓");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  // Request sort
  const [reqSort, setReqSort] = useState<{ field: string; dir: SortDir }>({ field: "createdAt", dir: "desc" });

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
  const payOptions = ["Todos", ...Object.values(PAYMENT_DISPLAY)];
  const fotosOptions = ["Todos", ...Object.values(FOTOS_DISPLAY)];
  const sortOptions = ["Reciente ↓", "Antiguo ↑", "Monto ↓", "Monto ↑", "Compromiso ↑"];

  const filteredProjects = useMemo(() => {
    if (tab === "calendar") return projects;
    const q = query.trim().toLowerCase();
    const result = projects.filter((project) => {
      const matchesTab = tab === "open" ? project.status !== "completed" : project.status === "completed";
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
        const assigned = users.find((u) => u.role === "engineer" && (u.id === project.createdBy || project.participants.includes(u.id)));
        if (!assigned || assigned.name !== engineerFilter) return false;
      }
      if (estimFilter !== "Todos" && project.estimacion !== estimFilter) return false;
      if (cotizFilter !== "Todos" && project.cotizacion !== cotizFilter) return false;
      if (payFilter !== "Todos") {
        const key = Object.keys(PAYMENT_DISPLAY).find((k) => PAYMENT_DISPLAY[k] === payFilter);
        if (project.paymentStatus !== key) return false;
      }
      if (fotosFilter !== "Todos") {
        const key = Object.keys(FOTOS_DISPLAY).find((k) => FOTOS_DISPLAY[k] === fotosFilter);
        const actual = project.fotosStatus ?? (project.fotos ? "si" : "no");
        if (actual !== key) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      switch (sortFilter) {
        case "Antiguo ↑": return a.createdAt.localeCompare(b.createdAt);
        case "Monto ↓": return (b.totalContratado ?? 0) - (a.totalContratado ?? 0);
        case "Monto ↑": return (a.totalContratado ?? 0) - (b.totalContratado ?? 0);
        case "Compromiso ↑": return (a.commitmentDate ?? "9999").localeCompare(b.commitmentDate ?? "9999");
        default: return b.createdAt.localeCompare(a.createdAt);
      }
    });
    return result;
  }, [clientFilter, departmentFilter, projects, query, tab, typeFilter, urgencyFilter, engineerFilter, statusFilter, estimFilter, cotizFilter, payFilter, fotosFilter, yearFilter, sortFilter, users]);

  const hasFilters = !!(query || yearFilter !== "Todos" || clientFilter !== "Todos" || typeFilter !== "Todos" || departmentFilter !== "Todos" || urgencyFilter !== "Todos" || engineerFilter !== "Todos" || statusFilter !== "Todos" || estimFilter !== "Todos" || cotizFilter !== "Todos" || payFilter !== "Todos" || fotosFilter !== "Todos");

  const clearFilters = (): void => {
    setQuery(""); setYearFilter("Todos"); setClientFilter("Todos"); setTypeFilter("Todos"); setDepartmentFilter("Todos");
    setUrgencyFilter("Todos"); setEngineerFilter("Todos"); setStatusFilter("Todos");
    setEstimFilter("Todos"); setCotizFilter("Todos"); setPayFilter("Todos"); setFotosFilter("Todos");
  };

  const summary = useMemo(() => ({
    porRevisar: requests.filter((r) => r.status === "under-review").length,
    activos: projects.filter((p) => ACTIVE_STATUSES_SUP.includes(p.status)).length,
    noPagados: projects.filter((p) => p.paymentStatus === "unpaid").length,
    rechazadas: requests.filter((r) => r.status === "rejected").length,
  }), [projects, requests]);

  const sortedRequests = useMemo(() => {
    return [...requests].sort((a, b) => {
      const va = String(a[reqSort.field as keyof typeof a] ?? "");
      const vb = String(b[reqSort.field as keyof typeof b] ?? "");
      const cmp = va.localeCompare(vb, "es-MX", { numeric: true });
      return reqSort.dir === "asc" ? cmp : -cmp;
    });
  }, [requests, reqSort]);

  const toggleSort = (
    current: { field: string; dir: SortDir },
    field: string,
    setter: (v: { field: string; dir: SortDir }) => void,
  ) => {
    if (current.field === field) {
      setter({ field, dir: current.dir === "asc" ? "desc" : "asc" });
    } else {
      setter({ field, dir: "asc" });
    }
  };

  const SortTh = ({
    field,
    label,
    current,
    setter,
    className,
  }: {
    field: string;
    label: string;
    current: { field: string; dir: SortDir };
    setter: (v: { field: string; dir: SortDir }) => void;
    className?: string;
  }) => (
    <th
      className={cn("px-6 py-3 text-left select-none", className)}
      onClick={() => toggleSort(current, field, setter)}
    >
      <button type="button" className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#888888] hover:text-accent transition-colors">
        {label}
        {current.field === field ? (
          current.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </th>
  );

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
          { title: "Por revisar", value: summary.porRevisar, icon: ShieldAlert, border: "border-[#F5A524]/20", iconBg: "bg-[#F5A524]/15 text-[#F5A524]", labelColor: "text-[#F5A524]", accent: "bg-warning" },
          { title: "Proyectos activos", value: summary.activos, icon: FolderOpenDot, border: "border-secondary/20", iconBg: "bg-secondary/15 text-secondary", labelColor: "text-secondary", accent: "bg-secondary" },
          { title: "No pagados", value: summary.noPagados, icon: BadgeDollarSign, border: "border-danger/20", iconBg: "bg-danger/15 text-danger", labelColor: "text-danger", accent: "bg-danger" },
          { title: "Rechazadas", value: summary.rechazadas, icon: AlertTriangle, border: "border-[#3F3F46]", iconBg: "bg-[#3F3F46] text-[#888888]", labelColor: "text-[#888888]", accent: "bg-[#52525B]" },
        ].map((card) => (
          <Card key={card.title} className={`relative overflow-hidden border bg-[#27272A] ${card.border}`}>
            <div className={`absolute left-0 top-0 h-full w-1 ${card.accent}`} />
            <div className="flex items-start justify-between gap-3 pl-3">
              <div className="flex-1">
                <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${card.labelColor}`}>{card.title}</p>
                <p className="mt-3 text-4xl font-bold tabular-nums text-foreground">{card.value}</p>
              </div>
              <div className={`rounded-2xl p-3 ${card.iconBg}`}><card.icon className="h-6 w-6" /></div>
            </div>
          </Card>
        ))}
      </div>

      <Tabs
        value={tab}
        onValueChange={onTabChange}
        options={[
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

      {/* ── Proyectos (abiertos / cerrados) ── */}
      {(tab === "open" || tab === "closed") ? (
        <>
          {/* Toolbar compacta */}
          <div className="flex flex-col gap-3 rounded-[24px] border border-[#3F3F46] bg-[#27272A] p-4 shadow-soft sm:p-5">
            <div className="flex items-center gap-3">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar proyectos…"
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
            {/* Filtros en línea */}
            <div className="flex flex-wrap gap-2">
              <CompactSelect label="Cliente" options={clients} value={clientFilter} onChange={setClientFilter} />
              <CompactSelect label="Depto." options={departments} value={departmentFilter} onChange={setDepartmentFilter} />
              <CompactSelect label="Tipo" options={types} value={typeFilter} onChange={setTypeFilter} />
              <CompactSelect label="Urgencia" options={urgencyOptions} value={urgencyFilter} onChange={setUrgencyFilter} />
              <CompactSelect label="Ingeniero" options={engineers} value={engineerFilter} onChange={setEngineerFilter} />
              <CompactSelect label="Estado" options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
              <CompactSelect label="Estimación" options={estimOptions} value={estimFilter} onChange={setEstimFilter} />
              <CompactSelect label="Cotización" options={cotizOptions} value={cotizFilter} onChange={setCotizFilter} />
              <CompactSelect label="Pago" options={payOptions} value={payFilter} onChange={setPayFilter} />
              <CompactSelect label="Fotos" options={fotosOptions} value={fotosFilter} onChange={setFotosFilter} />
              <CompactSelect label="Ordenar" options={sortOptions} value={sortFilter} onChange={setSortFilter} />
            </div>
            {/* Contador siempre visible */}
            <p className="text-xs text-[#888888]">
              Mostrando {filteredProjects.length} de {projects.filter((p) => tab === "open" ? p.status !== "completed" : p.status === "completed").length} proyecto{projects.length !== 1 ? "s" : ""}
              {hasFilters && (
                <button type="button" onClick={clearFilters} className="ml-3 text-accent hover:underline">Limpiar filtros</button>
              )}
            </p>
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
                      const [seq] = project.structuredName?.split("-") ?? ["—"];
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
        <ProjectCalendar projects={projects} onOpenProject={onOpenProject} showSideList />
      ) : null}

      {/* ── Solicitudes con ordenamiento ── */}
      {tab === "requests" ? (
        <div className="overflow-hidden rounded-[28px] border border-[#3F3F46] bg-[#27272A] shadow-panel">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#3F3F46]">
            <h3 className="text-sm font-bold text-foreground">Todas las solicitudes</h3>
            <span className="rounded-full bg-[#3F3F46] px-3 py-1 text-xs font-semibold text-[#A1A1AA]">Solo lectura</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#3F3F46]">
                  <SortTh field="baseName" label="Proyecto" current={reqSort} setter={setReqSort} />
                  <SortTh field="client" label="Cliente" current={reqSort} setter={setReqSort} />
                  <SortTh field="status" label="Estado" current={reqSort} setter={setReqSort} />
                  <SortTh field="createdAt" label="Fecha" current={reqSort} setter={setReqSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3F3F46]">
                {sortedRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-[#313136] transition-colors">
                    <td className="px-6 py-3 font-medium text-foreground">{req.baseName}</td>
                    <td className="px-6 py-3 text-[#A1A1AA]">{req.client}</td>
                    <td className="px-6 py-3"><StatusBadge kind="request" value={req.status} /></td>
                    <td className="px-6 py-3 text-[#888888]">
                      {new Date(req.createdAt).toLocaleDateString("es-MX")}
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-sm text-[#888888]">
                      No hay solicitudes registradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

    </section>
  );
}

function CompactSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 transition-colors ${
          isActive
            ? "border-accent/40 bg-accent/10"
            : "border-[#3F3F46] bg-[#313136] hover:border-white/20"
        }`}
      >
        <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isActive ? "text-accent" : "text-[#888888]"}`}>{label}</span>
        <span className={`max-w-[140px] truncate text-xs font-semibold ${isActive ? "text-accent" : "text-foreground"}`}>{value}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""} ${isActive ? "text-accent" : "text-[#888888]"}`} />
      </button>

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
