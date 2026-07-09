import { ArrowUpRight, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { SectionTitle } from "@/components/layout/section-title";
import { Tabs } from "@/components/ui/tabs";
import { ProjectCard } from "@/components/cards/project-card";
import { ProjectCalendar } from "@/components/common/project-calendar";
import { StatusBadge } from "@/components/common/status-badge";
import { CorrectionRequestDialog } from "@/components/dialogs/correction-request-dialog";
import { ProjectItem, RequestItem } from "@/types";

export type EngineerTab = "all" | "active" | "completed" | "requests" | "correction" | "calendar";

const CLOSED_STATUSES = ["completed", "cancelled", "no-autorizado", "cierre-por-sistema"];

const REQUEST_STATUS_LABELS: Record<string, string> = {
  "under-review": "En revisión por admin",
  "needs-correction": "Requiere corrección",
  "rejected": "No autorizada",
  "approved": "Aprobada — proyecto creado",
};

interface EngineerViewProps {
  tab: EngineerTab;
  onTabChange: (tab: EngineerTab) => void;
  activeUserName: string;
  projects: ProjectItem[];
  requests: RequestItem[];
  onOpenProject: (projectId: string) => void;
  onOpenNewRequest: () => void;
  onDeleteImportantDate?: (projectId: string, dateId: string) => void;
  onResubmitRequest: (
    requestId: string,
    fields: Pick<RequestItem, "baseName" | "client" | "department" | "lugar" | "type" | "description" | "structuredName">,
  ) => Promise<void>;
}

export function EngineerView({
  tab,
  onTabChange,
  activeUserName,
  projects,
  requests,
  onOpenProject,
  onOpenNewRequest,
  onDeleteImportantDate,
  onResubmitRequest,
}: EngineerViewProps): JSX.Element {
  const [correctionDialogReq, setCorrectionDialogReq] = useState<RequestItem | null>(null);

  const byNewest = (a: ProjectItem, b: ProjectItem) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

  const sortedProjects = [...projects].sort(byNewest);
  const activeProjects = sortedProjects.filter((p) => !CLOSED_STATUSES.includes(p.status));
  const completedProjects = sortedProjects.filter((p) => CLOSED_STATUSES.includes(p.status));

  const sortedRequests = [...requests]
    .filter((r) => r.status !== "needs-correction")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const correctionRequests = [...requests]
    .filter((r) => r.status === "needs-correction")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
    { key: "all" as const, label: "Mis proyectos", count: sortedProjects.length },
    { key: "active" as const, label: "Proyecto activo", count: activeProjects.length },
    { key: "completed" as const, label: "Proyecto terminado", count: completedProjects.length },
    { key: "requests" as const, label: "Solicitudes", count: sortedRequests.length },
    { key: "correction" as const, label: "En corrección", count: correctionRequests.length },
    { key: "calendar" as const, label: "Calendario", count: calendarEventCount },
  ];

  const displayed =
    tab === "all" ? sortedProjects : tab === "active" ? activeProjects : completedProjects;

  return (
    <section className="space-y-6">
      <SectionTitle
        eyebrow={`Espacio de trabajo de ${activeUserName}`}
        title="Centro de operación del ingeniero"
      />

      <Tabs value={tab} onValueChange={onTabChange} options={tabOptions} />

      {/* ── Proyectos ── */}
      {tab !== "requests" && tab !== "correction" && tab !== "calendar" ? (
        <div className="space-y-3">
          {displayed.map((project) => (
            <ProjectCard key={project.id} project={project} onOpen={onOpenProject} />
          ))}
          {displayed.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Sin proyectos</p>
          )}
        </div>
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
          {sortedRequests.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-border-default py-16 text-center">
              <p className="text-sm font-semibold text-muted-foreground">No has enviado solicitudes</p>
              <button
                type="button"
                onClick={onOpenNewRequest}
                className="mt-4 text-xs font-bold text-accent hover:underline"
              >
                + Crear primera solicitud
              </button>
            </div>
          ) : (
            sortedRequests.map((req) => (
              <div
                key={req.id}
                className="rounded-[20px] border border-border-default bg-surface-elevated p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind="request" value={req.status} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                    {req.client} · {req.department}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(req.createdAt).toLocaleDateString("es-MX", {
                      day: "2-digit", month: "short", year: "numeric",
                    })}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-foreground">{req.baseName}</h3>
                <p className="text-xs text-muted-foreground">{req.structuredName}</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-ink-secondary">
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
                  <div className="rounded-xl border border-danger/15 bg-danger/5 px-3 py-2 text-xs text-ink-secondary">
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
          {correctionRequests.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-border-default py-16 text-center">
              <p className="text-sm font-semibold text-muted-foreground">Sin solicitudes en corrección</p>
            </div>
          ) : (
            correctionRequests.map((req) => (
              <div
                key={req.id}
                className="cursor-pointer rounded-[20px] border border-info/25 bg-[#0c1f2e] p-4 space-y-2 transition hover:border-info/50 hover:bg-[#0d2535]"
                onClick={() => setCorrectionDialogReq(req)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind="request" value={req.status} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-info">
                    {req.client} · {req.department}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(req.createdAt).toLocaleDateString("es-MX", {
                      day: "2-digit", month: "short", year: "numeric",
                    })}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-foreground">{req.baseName}</h3>
                <p className="text-xs text-muted-foreground">{req.structuredName || "Sin folio"}</p>

                {req.correctionReason ? (
                  <div className="rounded-xl border border-info/15 bg-info/5 px-3 py-2 text-xs text-ink-secondary">
                    <span className="font-bold text-info">Corrección requerida: </span>
                    {req.correctionReason}
                  </div>
                ) : null}

                <div className="flex items-center justify-end pt-1">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-info">
                    <Pencil className="h-3.5 w-3.5" />
                    Abrir y corregir
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

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

      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-30">
        <button
          type="button"
          onClick={onOpenNewRequest}
          className="flex h-14 items-center gap-2.5 rounded-full bg-accent px-5 text-sm font-bold text-brand-fg shadow-glow-gold transition hover:bg-accent/90"
        >
          <Plus className="h-5 w-5" />
          Nueva solicitud
        </button>
      </div>
    </section>
  );
}
