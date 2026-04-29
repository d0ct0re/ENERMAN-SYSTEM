import { FolderPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { SectionTitle } from "@/components/layout/section-title";
import { Tabs } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ProjectCard } from "@/components/cards/project-card";
import { Button } from "@/components/ui/button";
import { ProjectCalendar } from "@/components/common/project-calendar";
import { InvoiceItem, ProjectItem, RequestItem } from "@/types";
import { StatusBadge } from "@/components/common/status-badge";

type SupervisorTab = "open" | "closed" | "calendar" | "requests" | "invoices";

interface SupervisorViewProps {
  tab: SupervisorTab;
  onTabChange: (tab: SupervisorTab) => void;
  projects: ProjectItem[];
  requests: RequestItem[];
  onOpenProject: (projectId: string) => void;
  onOpenNewProject: () => void;
}

export function SupervisorView({ tab, onTabChange, projects, requests, onOpenProject, onOpenNewProject }: SupervisorViewProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("Todos");
  const [typeFilter, setTypeFilter] = useState<string>("Todos");
  const [departmentFilter, setDepartmentFilter] = useState<string>("Todos");

  const clients = useMemo(() => ["Todos", ...new Set(projects.map((p) => p.client))], [projects]);
  const types = useMemo(() => ["Todos", ...new Set(projects.map((p) => p.type))], [projects]);
  const departments = useMemo(() => ["Todos", ...new Set(projects.map((p) => p.department))], [projects]);

  const filteredProjects = useMemo(
    () =>
      projects.filter((project) => {
        if (tab === "calendar") return true;
        const matchesTab = tab === "open" ? project.status !== "completed" : project.status === "completed";
        const normalizedSearch = query.trim().toLowerCase();
        const matchesQuery =
          normalizedSearch.length === 0 ||
          [project.structuredName, project.client, project.description, project.baseName]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);
        const matchesClient = clientFilter === "Todos" || project.client === clientFilter;
        const matchesType = typeFilter === "Todos" || project.type === typeFilter;
        const matchesDepartment = departmentFilter === "Todos" || project.department === departmentFilter;
        return matchesTab && matchesQuery && matchesClient && matchesType && matchesDepartment;
      }),
    [clientFilter, departmentFilter, projects, query, tab, typeFilter],
  );

  const pendingInvoices = useMemo<Array<InvoiceItem & { projectName: string; projectId: string }>>(() => {
    return projects.flatMap((project) =>
      (project.invoices ?? [])
        .filter((inv) => inv.status !== "pagada" && inv.status !== "cancelada")
        .map((inv) => ({ ...inv, projectName: project.structuredName ?? project.baseName, projectId: project.id })),
    );
  }, [projects]);

  const pendingInvoicesCount = pendingInvoices.length;

  return (
    <section className="space-y-6">
      <SectionTitle
        eyebrow="Vista del supervisor"
        title="Seguimiento ejecutivo de proyectos"
        actions={
          <Button onClick={onOpenNewProject} variant="accent">
            <FolderPlus className="h-4 w-4" />
            Nuevo proyecto
          </Button>
        }
      />

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
          { key: "invoices", label: "Facturas pend.", count: pendingInvoicesCount },
        ]}
      />

      {(tab === "open" || tab === "closed") ? (
        <>
          <div className="grid gap-4 rounded-[28px] border border-[#3F3F46] bg-[#27272A] p-4 shadow-panel sm:p-5 lg:grid-cols-3">
            <div className="lg:col-span-3">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar proyectos"
                className="h-12 rounded-[18px] text-sm sm:h-14 sm:rounded-[22px] sm:text-base"
              />
            </div>
            <FilterChips options={clients} value={clientFilter} onChange={setClientFilter} label="Cliente" />
            <FilterChips options={types} value={typeFilter} onChange={setTypeFilter} label="Tipo" />
            <FilterChips options={departments} value={departmentFilter} onChange={setDepartmentFilter} label="Departamento" />
          </div>
          <div className="space-y-3">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} onOpen={onOpenProject} />
            ))}
          </div>
        </>
      ) : null}

      {tab === "calendar" ? (
        <ProjectCalendar projects={projects} onOpenProject={onOpenProject} showSideList />
      ) : null}

      {tab === "requests" ? (
        <div className="rounded-[28px] border border-[#3F3F46] bg-[#27272A] shadow-panel overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#3F3F46]">
            <h3 className="text-sm font-bold text-foreground">Todas las solicitudes</h3>
            <span className="rounded-full bg-[#3F3F46] px-3 py-1 text-xs font-semibold text-[#A1A1AA]">Solo lectura</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#3F3F46] text-xs font-semibold uppercase tracking-[0.14em] text-[#888888]">
                  <th className="px-6 py-3 text-left">Proyecto</th>
                  <th className="px-6 py-3 text-left">Cliente</th>
                  <th className="px-6 py-3 text-left">Estado</th>
                  <th className="px-6 py-3 text-left">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3F3F46]">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-[#313136] transition-colors">
                    <td className="px-6 py-3 font-medium text-foreground">{req.baseName}</td>
                    <td className="px-6 py-3 text-[#A1A1AA]">{req.client}</td>
                    <td className="px-6 py-3">
                      <StatusBadge kind="request" value={req.status} />
                    </td>
                    <td className="px-6 py-3 text-[#888888]">
                      {new Date(req.createdAt).toLocaleDateString("es-MX")}
                    </td>
                  </tr>
                ))}
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-sm text-[#888888]">
                      No hay solicitudes registradas
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "invoices" ? (
        <div className="rounded-[28px] border border-[#3F3F46] bg-[#27272A] shadow-panel overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#3F3F46]">
            <h3 className="text-sm font-bold text-foreground">Facturas pendientes de cobro</h3>
            <span className="rounded-full bg-[#3F3F46] px-3 py-1 text-xs font-semibold text-[#A1A1AA]">Solo lectura</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#3F3F46] text-xs font-semibold uppercase tracking-[0.14em] text-[#888888]">
                  <th className="px-6 py-3 text-left">Proyecto</th>
                  <th className="px-6 py-3 text-left">Factura</th>
                  <th className="px-6 py-3 text-left">Monto</th>
                  <th className="px-6 py-3 text-left">Estado</th>
                  <th className="px-6 py-3 text-left">Promesa pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3F3F46]">
                {pendingInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-[#313136] transition-colors cursor-pointer"
                    onClick={() => onOpenProject(inv.projectId)}
                  >
                    <td className="px-6 py-3 font-medium text-foreground">{inv.projectName}</td>
                    <td className="px-6 py-3 text-[#A1A1AA]">{inv.factura || "—"}</td>
                    <td className="px-6 py-3 text-foreground">
                      {inv.subtotal != null
                        ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(inv.subtotal)
                        : "—"}
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent capitalize">
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-[#888888]">
                      {inv.promesaPago ? new Date(inv.promesaPago).toLocaleDateString("es-MX") : "—"}
                    </td>
                  </tr>
                ))}
                {pendingInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-[#888888]">
                      No hay facturas pendientes
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onOpenNewProject}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-3 rounded-full bg-accent px-5 py-4 text-sm font-bold text-[#111111] shadow-glow-gold transition hover:bg-accent/90"
      >
        <FolderPlus className="h-5 w-5" />
        Nuevo proyecto
      </button>
    </section>
  );
}

interface FilterChipsProps {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

function FilterChips({ label, options, value, onChange }: FilterChipsProps): JSX.Element {
  return (
    <div className="space-y-3 rounded-[22px] border border-accent/15 bg-accent/[0.05] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888888]">{label}</p>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-[#3F3F46] bg-[#313136] px-4 text-sm font-semibold text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10 lg:hidden"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <div className="chip-scroll hidden gap-2 overflow-x-auto lg:flex">
        {options.map((option) => (
          <Button
            key={option}
            variant={option === value ? "default" : "outline"}
            size="sm"
            className="whitespace-nowrap"
            onClick={() => onChange(option)}
          >
            {option}
          </Button>
        ))}
      </div>
    </div>
  );
}
