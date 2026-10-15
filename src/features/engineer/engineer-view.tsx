import type { ProjectPhase } from "@/components/cards/project-phase-steps";
import { EngineerProjectChart } from "./components/engineer-project-chart";
import { Button } from "@/components/ui/button";
import { EngineerMetrics } from "./components/engineer-metrics";
import { EngineerInsights } from "./components/engineer-insights";
import { ArrowUpRight, Pencil, Plus, FolderOpen } from "lucide-react";
import "./engineer-view.css";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { EngineerProjectList } from "./components/engineer-project-list";
import { ProjectCalendar } from "@/components/common/project-calendar";
import { StatusBadge } from "@/components/common/status-badge";
import { CorrectionRequestDialog } from "@/components/dialogs/correction-request-dialog";
import { ProjectItem, RequestItem, NotificationItem, UserItem } from "@/types";
import { getRequestSequence, getRequestSequenceNumber, parseLocalDate } from "@/lib/utils";

export type EngineerTab = "home" | "all" | "active" | "completed" | "requests" | "correction" | "calendar";

const CLOSED_STATUSES = ["completed", "cancelled", "no-autorizado", "cierre-por-sistema"];

const REQUEST_STATUS_LABELS: Record<string, string> = {
  "under-review": "En revisión por admin",
  "needs-correction": "Requiere corrección",
  "rejected": "No autorizada",
  "approved": "Aprobada — proyecto creado",
};

interface EngineerViewProps {
  engineers?: Pick<UserItem, "id" | "name">[];
  sidebarOpen: boolean;
  notifications: NotificationItem[];
  onOpenNotification: (notification: NotificationItem) => void;
  tab: EngineerTab;
  onTabChange: (tab: EngineerTab) => void;
  activeUserName: string;
  projects: ProjectItem[];
  globalProjects?: ProjectItem[];
  requests: RequestItem[];
  onOpenProject: (projectId: string) => void;
  onOpenProjectPhase?: (projectId: string, phase: ProjectPhase) => void;
  canEditProject?: (project: ProjectItem) => boolean;
  getAssignedEngineerName?: (project: ProjectItem) => string | undefined;
  onOpenNewRequest: () => void;
  onDeleteImportantDate?: (projectId: string, dateId: string) => void;
  onResubmitRequest: (
    requestId: string,
    fields: Pick<RequestItem, "baseName" | "client" | "department" | "lugar" | "type" | "description" | "structuredName">,
  ) => Promise<void>;
}

export function EngineerView({
  engineers = [], sidebarOpen, notifications, onOpenNotification, onOpenProjectPhase, canEditProject, getAssignedEngineerName,
  tab,
  onTabChange,
  activeUserName,
  projects,
  globalProjects = projects,
  requests,
  onOpenProject,
  onOpenNewRequest,
  onDeleteImportantDate,
  onResubmitRequest,
}: EngineerViewProps): JSX.Element {
  const [correctionDialogReq, setCorrectionDialogReq] = useState<RequestItem | null>(null);
  const [reqQuery, setReqQuery] = useState("");

  const byNewest = (a: ProjectItem, b: ProjectItem) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

  const sortedProjects = [...projects].sort(byNewest);
  const personalActiveProjects = sortedProjects.filter((p) => !CLOSED_STATUSES.includes(p.status));
  const activeProjects = [...globalProjects].filter((p) => !p.deletedAt && !CLOSED_STATUSES.includes(p.status)).sort(byNewest);
  const completedProjects = sortedProjects.filter((p) => CLOSED_STATUSES.includes(p.status));

  const bySequenceThenNewest = (a: RequestItem, b: RequestItem) => {
    const diff = getRequestSequenceNumber(b, projects) - getRequestSequenceNumber(a, projects);
    return diff !== 0 ? diff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  };

  const matchesQuery = (r: RequestItem) => {
    const q = reqQuery.trim().toLowerCase();
    if (!q) return true;
    return [r.baseName, r.client, getRequestSequence(r, projects)].some((f) => f.toLowerCase().includes(q));
  };

  const sortedRequests = useMemo(
    () => [...requests].filter((r) => r.status !== "needs-correction").filter(matchesQuery).sort(bySequenceThenNewest),
    [requests, projects, reqQuery],
  );

  const correctionRequests = useMemo(
    () => [...requests].filter((r) => r.status === "needs-correction").filter(matchesQuery).sort(bySequenceThenNewest),
    [requests, projects, reqQuery],
  );

  const calendarEventCount = projects.reduce(
    (n, p) =>
      n +
      (p.endDate ? 1 : 0) +
      (p.commitmentDate ? 1 : 0) +
      (p.startDate ? 1 : 0) +
      (p.fechaSolicitud ? 1 : 0) +
      (p.importantDates?.length ?? 0),
    0,
  );

  const tabOptions = [
    { key: "home" as const, label: "Inicio", count: undefined },
    { key: "all" as const, label: "Mis proyectos", count: sortedProjects.length },
    { key: "active" as const, label: "Proyectos activos", count: activeProjects.length },
    { key: "completed" as const, label: "Proyecto terminado", count: completedProjects.length },
    { key: "requests" as const, label: "Solicitudes", count: sortedRequests.length },
    { key: "correction" as const, label: "En corrección", count: correctionRequests.length },
    { key: "calendar" as const, label: "Calendario", count: calendarEventCount },
  ];

  const displayed =
    tab === "home" ? activeProjects.slice(0, 4) : tab === "all" ? sortedProjects : tab === "active" ? activeProjects : completedProjects;

  const pendingRequests = requests.filter((request) => request.status === "under-review");
  const corrections = requests.filter((request) => request.status === "needs-correction");
  const upcoming = personalActiveProjects
    .filter((project) => project.commitmentDate && parseLocalDate(project.commitmentDate).getTime() >= new Date().setHours(0, 0, 0, 0))
    .sort((a, b) => parseLocalDate(a.commitmentDate!).getTime() - parseLocalDate(b.commitmentDate!).getTime())
    .slice(0, 4);
  const distribution = [
    { label: "Activos", count: personalActiveProjects.length, color: "#f5a524" },
    { label: "Terminados", count: sortedProjects.filter((project) => project.status === "completed").length, color: "#20b8a6" },
    { label: "Otros cierres", count: completedProjects.filter((project) => project.status !== "completed").length, color: "#71717a" },
  ];

  return (
    <section className={`engineer-workspace ${sidebarOpen ? "" : "is-sidebar-collapsed"} ${tab === "home" ? "is-home" : "is-section"}`}>

      <div className="engineer-content">
        {tab === "home" && <><div className="engineer-home-heading"><div><h1>Mi espacio de trabajo</h1><p>{activeUserName} &middot; Proyectos y pendientes</p></div><Button variant="accent" onClick={onOpenNewRequest}><Plus size={16} />Nueva solicitud</Button></div></>}
        {tab === "home" && <EngineerMetrics activeCount={activeProjects.length} pendingCount={pendingRequests.length} correctionCount={corrections.length} completedCount={distribution[1].count} onTabChange={onTabChange} />}
        {tab === "home" && <div className="engineer-home-overview"><EngineerProjectChart engineers={engineers} projects={projects} globalProjects={globalProjects} onOpen={onOpenProject} onOpenPhase={onOpenProjectPhase} getAssignedEngineerName={getAssignedEngineerName} /><EngineerInsights upcoming={upcoming} onOpenProject={onOpenProject} onTabChange={onTabChange} projectCount={projects.length} distribution={distribution} /></div>}
        <div className="engineer-overview-layout">
        <div className="engineer-panel">
          <div className="engineer-panel-heading"><h2><FolderOpen size={18} />{tab === "home" ? "Proyectos activos" : tabOptions.find((option) => option.key === tab)?.label}</h2><span>{tab === "home" ? activeProjects.length : tabOptions.find((option) => option.key === tab)?.count} registros</span></div>


      {/* ── Proyectos ── */}
      {tab !== "requests" && tab !== "correction" && tab !== "calendar" ? (
        <EngineerProjectList projects={displayed} onOpen={onOpenProject} onOpenPhase={onOpenProjectPhase} getAssignedEngineerName={getAssignedEngineerName} />
      ) : null}

      {/* ── Calendario ── */}
      {tab === "calendar" ? (
        <ProjectCalendar
          projects={projects}
          onOpenProject={onOpenProject}
          onDeleteImportantDate={onDeleteImportantDate}
        />
      ) : null}

      {/* ── Solicitudes normales ── */}
      {tab === "requests" ? (
        <div className="space-y-3">
          {requests.length > 0 ? (
            <Input
              value={reqQuery}
              onChange={(e) => setReqQuery(e.target.value)}
              placeholder="Buscar por N° proyecto, nombre o cliente…"
              className="h-10"
            />
          ) : null}
          {sortedRequests.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-[color:var(--line)] py-16 text-center">
              <p className="text-sm font-semibold text-[color:var(--text-muted)]">
                {requests.length === 0 ? "No has enviado solicitudes" : "Sin resultados para la búsqueda"}
              </p>
              {requests.length === 0 ? (
                <button
                  type="button"
                  onClick={onOpenNewRequest}
                  className="mt-4 text-xs font-bold text-accent hover:underline"
                >
                  + Crear primera solicitud
                </button>
              ) : null}
            </div>
          ) : (
            sortedRequests.map((req) => (
              <div
                key={req.id}
                className="engineer-record-card rounded-[20px] border border-[color:var(--line)] bg-[var(--surface)] p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] font-black text-accent">
                    #{getRequestSequence(req, projects)}
                  </span>
                  <StatusBadge kind="request" value={req.status} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                    {req.client} · {req.department}
                  </span>
                  <span className="ml-auto text-xs text-[color:var(--text-muted)]">
                    {parseLocalDate(req.createdAt).toLocaleDateString("es-MX", {
                      day: "2-digit", month: "short", year: "numeric",
                    })}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-foreground">{req.baseName}</h3>
                <p className="text-xs text-[color:var(--text-muted)]">{req.structuredName}</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[color:var(--text-muted)]">
                    {REQUEST_STATUS_LABELS[req.status] ?? req.status}
                  </p>
                  {req.status === "approved" && req.linkedProjectId ? (
                    <button
                      type="button"
                      onClick={() => onOpenProject(req.linkedProjectId!)}
                      className="flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent transition hover:bg-accent/20"
                    >
                      Ver proyecto
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                {req.rejectionReason ? (
                  <div className="rounded-xl border border-danger/15 bg-danger/5 px-3 py-2 text-xs text-[color:var(--text-muted)]">
                    <span className="font-bold text-danger">Motivo: </span>
                    {req.rejectionReason}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* ── Solicitudes en corrección ── */}
      {tab === "correction" ? (
        <div className="space-y-3">
          {requests.filter((r) => r.status === "needs-correction").length > 0 ? (
            <Input
              value={reqQuery}
              onChange={(e) => setReqQuery(e.target.value)}
              placeholder="Buscar por N° proyecto, nombre o cliente…"
              className="h-10"
            />
          ) : null}
          {correctionRequests.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-[color:var(--line)] py-16 text-center">
              <p className="text-sm font-semibold text-[color:var(--text-muted)]">
                {requests.some((r) => r.status === "needs-correction") ? "Sin resultados para la búsqueda" : "Sin solicitudes en corrección"}
              </p>
            </div>
          ) : (
            correctionRequests.map((req) => (
              <div
                key={req.id}
                className="engineer-record-card cursor-pointer rounded-[20px] border border-[#0EA5E9]/25 bg-[#0c1f2e] p-4 space-y-2 transition hover:border-[#0EA5E9]/50 hover:bg-[#0d2535]"
                onClick={() => setCorrectionDialogReq(req)}
              >
                {/* Header */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] font-black text-accent">
                    #{getRequestSequence(req, projects)}
                  </span>
                  <StatusBadge kind="request" value={req.status} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0EA5E9]">
                    {req.client} · {req.department}
                  </span>
                  <span className="ml-auto text-xs text-[color:var(--text-muted)]">
                    {parseLocalDate(req.createdAt).toLocaleDateString("es-MX", {
                      day: "2-digit", month: "short", year: "numeric",
                    })}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-foreground">{req.baseName}</h3>
                <p className="text-xs text-[color:var(--text-muted)]">{req.structuredName || "Sin folio"}</p>

                {/* Motivo de corrección */}
                {req.correctionReason ? (
                  <div className="rounded-xl border border-[#0EA5E9]/15 bg-[#0EA5E9]/5 px-3 py-2 text-xs text-[color:var(--text-muted)]">
                    <span className="font-bold text-[#0EA5E9]">Corrección requerida: </span>
                    {req.correctionReason}
                  </div>
                ) : null}

                {/* CTA */}
                <div className="flex items-center justify-end pt-1">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-[#0EA5E9]">
                    <Pencil className="h-3.5 w-3.5" />
                    Abrir y corregir
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* Diálogo de corrección */}
      {correctionDialogReq ? (
        <CorrectionRequestDialog
          open={correctionDialogReq !== null}
          onOpenChange={(open) => { if (!open) setCorrectionDialogReq(null); }}
          request={correctionDialogReq}
          existingProjects={projects}
          onResubmit={async (fields) => {
            await onResubmitRequest(correctionDialogReq.id, fields);
            setCorrectionDialogReq(null);
          }}
        />
      ) : null}

        </div>
        </div>
      </div>
      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-30">
        <button
          type="button"
          onClick={onOpenNewRequest}
          className="flex h-14 items-center gap-2.5 rounded-full bg-accent px-5 text-sm font-bold text-[#111111] shadow-glow-gold transition hover:bg-accent/90"
        >
          <Plus className="h-5 w-5" />
          Nueva solicitud
        </button>
      </div>
    </section>
  );
}
