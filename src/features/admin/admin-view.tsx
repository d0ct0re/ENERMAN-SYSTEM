import { BadgeCheck, BadgeDollarSign, Check, ChevronDown, DatabaseBackup, DollarSign, Eye, FileText, FolderOpenDot, MoreVertical, Plus, RotateCcw, Save, ShieldAlert, Trash2, UploadCloud, UserPlus, UsersRound, Wrench, X } from "lucide-react";
import { ComponentType, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cn, formatDate, isNewItem, parseLocalDate, getProjectSequenceNumber, getRequestSequence, getRequestSequenceNumber, maskRequestSequence } from "@/lib/utils";
import { AppSettings, downloadBackup, downloadFilesBackup, restoreBackup } from "@/lib/api";
import { FIXED_CLIENTS } from "@/components/ui/client-input";
import { SectionTitle } from "@/components/layout/section-title";
import { Tabs } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { AdminReviewCard } from "@/components/cards/admin-review-card";
import { ProjectCard } from "@/components/cards/project-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PriorityBadge } from "@/components/common/priority-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { ProjectCalendar } from "@/components/common/project-calendar";
import { ActivityLogItem, InvoiceItem, InvoiceStatus, PROJECT_TYPE_LABELS, TIPO_PAGO_LABELS, ProjectItem, ProjectStatus, ProjectType, RequestItem, RequestStatus, RoleKey, TipoPago, UserItem } from "@/types";

type AdminTab =
  | "review"
  | "active"
  | "allprojects"
  | "completed"
  | "cancelled"
  | "unpaid"
  | "rejected"
  | "correction"
  | "calendar"
  | "users"
  | "projects"
  | "requests"
  | "activity"
  | "cobros";

interface AdminViewProps {
  tab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  activeUserName: string;
  reviewRequests: RequestItem[];
  activeProjects: ProjectItem[];
  completedProjects: ProjectItem[];
  cancelledProjects: ProjectItem[];
  paidProjects: ProjectItem[];
  unpaidProjects: ProjectItem[];
  rejectedRequests: RequestItem[];
  correctionRequests: RequestItem[];
  projects: ProjectItem[];
  requests: RequestItem[];
  users: UserItem[];
  activityLogs: ActivityLogItem[];
  canManageUsers: boolean;
  sequenceInfo?: { current: number; next: number; display: string } | null;
  onSetSequenceCounter?: (value: number) => Promise<void>;
  appSettings?: AppSettings;
  onSetAppSetting?: (name: keyof AppSettings, value: boolean) => Promise<void>;
  onBulkDeleteBeforeFolio?: (folio: number) => Promise<{ deletedProjects: number; deletedRequests: number }>;
  onCreateProject: (payload: {
    sequence: string;
    baseName: string;
    client: string;
    department: string;
    lugar?: string;
    type: ProjectType;
    description: string;
    status: ProjectStatus;
    paymentStatus: ProjectItem["paymentStatus"];
    tipoPago: TipoPago;
    priority: ProjectItem["priority"];
    totalContratado: number;
    assignedEngineerId?: string;
  }) => void;
  onDeleteProject: (projectId: string) => void;
  onRestoreProject?: (projectId: string) => void;
  onPermanentDeleteProject?: (projectId: string) => void;
  onCreateRequest: (payload: {
    baseName: string;
    client: string;
    department: string;
    type: ProjectType;
    description: string;
    createdBy: string;
    status: RequestStatus;
  }) => void;
  onDeleteRequest: (requestId: string) => void;
  onCreateUser: (payload: Omit<UserItem, "id" | "name" | "avatar" | "roleLabel" | "isActive" | "createdAt" | "updatedAt">) => void;
  onUpdateUser: (userId: string, payload: Pick<UserItem, "firstName" | "lastName" | "email" | "department" | "role" | "isActive" | "password">) => Promise<void>;
  onDeleteUser: (userId: string) => void;
  onOpenRequest: (requestId: string) => void;
  onOpenProject: (projectId: string) => void;
  onApproveRequest?: (requestId: string) => void;
  onRejectRequest?: (requestId: string, reason: string) => void;
  onCorrectionRequest?: (requestId: string, reason: string) => void;
  onReactivateRequest?: (requestId: string) => void;
}

export function AdminView(props: AdminViewProps): JSX.Element {
  if (props.canManageUsers) {
    return <SystemAdminView {...props} />;
  }

  return <LegacyAdminView {...props} />;
}

function SystemAdminView({
  tab,
  onTabChange,
  activeUserName,
  projects,
  requests,
  users,
  activityLogs,
  sequenceInfo,
  onSetSequenceCounter,
  appSettings,
  onSetAppSetting,
  onBulkDeleteBeforeFolio,
  onCreateProject,
  onDeleteProject,
  onRestoreProject,
  onPermanentDeleteProject,
  onCreateRequest,
  onDeleteRequest,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  onOpenProject,
  onOpenRequest,
  onApproveRequest,
  onRejectRequest,
}: AdminViewProps): JSX.Element {
  const systemTab = tab === "requests" || tab === "users" || tab === "projects" || tab === "activity" ? tab : "projects";
  const TRASH_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
  const [backingUp, setBackingUp] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [backingUpFiles, setBackingUpFiles] = useState(false);
  const [restoreFile, setRestoreFile] = useState<{ name: string; data: unknown; meta: { timestamp?: string; projects?: number; users?: number; requests?: number } } | null>(null);
  const [restoring, setRestoring] = useState(false);
  // Estado para el panel de gestión de consecutivos
  const [seqInput, setSeqInput] = useState("");
  const [seqSaving, setSeqSaving] = useState(false);
  const [seqMsg, setSeqMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // Estado para el panel de limpieza de datos de prueba (borrado masivo por folio)
  const [cleanupInput, setCleanupInput] = useState("");
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupMsg, setCleanupMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async (): Promise<void> => {
    setBackingUp(true);
    setBackupMsg(null);
    try {
      await downloadBackup();
      setBackupMsg("Backup descargado");
    } catch {
      setBackupMsg("Error al generar backup");
    } finally {
      setBackingUp(false);
      setTimeout(() => setBackupMsg(null), 3000);
    }
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Record<string, unknown>;
        if (!data.users || !Array.isArray(data.users)) {
          setRestoreMsg({ text: "Archivo inválido — no es un backup de ENERMAN-SYSTEM", ok: false });
          return;
        }
        setRestoreFile({
          name: file.name,
          data,
          meta: {
            timestamp: data.timestamp as string | undefined,
            users: (data.users as unknown[]).length,
            projects: Array.isArray(data.projects) ? (data.projects as unknown[]).length : 0,
            requests: Array.isArray(data.requests) ? (data.requests as unknown[]).length : 0,
          },
        });
        setRestoreMsg(null);
      } catch {
        setRestoreMsg({ text: "Error al leer el archivo — ¿es un JSON válido?", ok: false });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleRestore = async (): Promise<void> => {
    if (!restoreFile) return;
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const result = await restoreBackup(restoreFile.data);
      setRestoreMsg({
        text: `Restaurado: ${result.restored.projects} proyectos, ${result.restored.users} usuarios, ${result.restored.requests} solicitudes`,
        ok: true,
      });
      setRestoreFile(null);
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setRestoreMsg({ text: err instanceof Error ? err.message : "Error al restaurar", ok: false });
    } finally {
      setRestoring(false);
    }
  };
  const activeProjects = useMemo(() => projects.filter((p) => !p.deletedAt), [projects]);
  const trashedProjects = useMemo(
    () => projects.filter((p) => p.deletedAt).sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")),
    [projects],
  );


  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <SectionTitle eyebrow={`Espacio de trabajo de ${activeUserName}`} title="Gestión general del sistema" />
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={() => { void handleBackup(); }}
            disabled={backingUp}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#3F3F46] bg-[#27272A] px-4 py-2.5 text-sm font-bold text-[#A1A1AA] transition hover:border-accent/40 hover:bg-[#313136] hover:text-foreground disabled:opacity-50"
          >
            <DatabaseBackup className="h-4 w-4" />
            {backingUp ? "Generando…" : "Backup"}
          </button>
          {backupMsg ? (
            <span className={`text-xs font-semibold ${backupMsg.startsWith("Error") ? "text-danger" : "text-[#4ADE80]"}`}>
              {backupMsg}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard title="Proyectos" value={projects.length} tone={projects.length > 0 ? "accent" : "secondary"} />
        <SummaryCard title="Solicitudes" value={requests.length} tone={requests.length > 0 ? "warning" : "secondary"} />
        <SummaryCard title="Usuarios" value={users.length} tone="secondary" />
      </div>

      {/* ── Panel Backup / Restauración ── */}
      <div className="rounded-2xl border border-[#3F3F46] bg-[#1E1E20] p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#888888]">
          Seguridad de datos — Backup y Restauración
        </p>
        <div className="flex flex-wrap gap-2">
          {/* Botón Backup */}
          <button
            type="button"
            onClick={() => { void handleBackup(); }}
            disabled={backingUp}
            className="inline-flex items-center gap-2 rounded-xl border border-[#3F3F46] bg-[#27272A] px-4 py-2 text-sm font-semibold text-[#A1A1AA] transition hover:border-accent/40 hover:bg-[#313136] hover:text-foreground disabled:opacity-50"
          >
            <DatabaseBackup className="h-4 w-4" />
            {backingUp ? "Generando…" : "Descargar backup"}
          </button>
          {/* Botón Backup Archivos */}
          <button
            type="button"
            onClick={async () => {
              setBackingUpFiles(true);
              try {
                await downloadFilesBackup();
              } catch (err) {
                setBackupMsg(err instanceof Error ? err.message : "Error al descargar archivos");
              } finally {
                setBackingUpFiles(false);
              }
            }}
            disabled={backingUpFiles}
            title="Descarga un ZIP con todas las fotos, PDFs y documentos subidos"
            className="inline-flex items-center gap-2 rounded-xl border border-[#3F3F46] bg-[#27272A] px-4 py-2 text-sm font-semibold text-[#A1A1AA] transition hover:border-accent/40 hover:bg-[#313136] hover:text-foreground disabled:opacity-50"
          >
            <FolderOpenDot className="h-4 w-4" />
            {backingUpFiles ? "Generando…" : "Descargar archivos"}
          </button>
          {/* Botón Exportar CSV */}
          <button
            type="button"
            onClick={() => exportProjectsCSV(activeProjects, users)}
            title={`Exportar ${activeProjects.length} proyecto(s) a CSV`}
            className="inline-flex items-center gap-2 rounded-xl border border-[#3F3F46] bg-[#27272A] px-4 py-2 text-sm font-semibold text-[#A1A1AA] transition hover:border-accent/40 hover:bg-[#313136] hover:text-foreground"
          >
            <Save className="h-4 w-4" />
            Exportar CSV
          </button>
          {/* Botón Restaurar */}
          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            title="Sobreescribe todos los datos actuales — acción de alto riesgo"
            className="inline-flex items-center gap-2 rounded-xl border border-[#F5A524]/30 bg-[#F5A524]/5 px-4 py-2 text-sm font-semibold text-[#F5A524]/90 transition hover:border-[#F5A524]/60 hover:bg-[#F5A524]/15 hover:text-[#F5A524]"
          >
            <UploadCloud className="h-4 w-4" />
            Restaurar desde backup
          </button>
          <input ref={restoreInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleRestoreFile} />
        </div>

        {/* Mensajes de backup */}
        {backupMsg ? (
          <p className="mt-2 text-xs font-semibold text-[#4ADE80]">{backupMsg}</p>
        ) : null}

        {/* Panel de confirmación de restauración */}
        {restoreFile ? (
          <div className="mt-3 rounded-xl border border-[#F5A524]/30 bg-[#F5A524]/5 p-3">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#F5A524]">Confirmar restauración</p>
            <p className="text-sm font-semibold text-foreground">{restoreFile.name}</p>
            {restoreFile.meta.timestamp ? (
              <p className="text-xs text-[#888888]">Fecha del backup: {new Date(restoreFile.meta.timestamp).toLocaleString("es-MX")}</p>
            ) : null}
            <div className="mt-1.5 flex gap-3 text-xs text-[#A1A1AA]">
              <span>{restoreFile.meta.projects} proyectos</span>
              <span>{restoreFile.meta.users} usuarios</span>
              <span>{restoreFile.meta.requests} solicitudes</span>
            </div>
            <p className="mt-2 text-xs font-medium text-[#F5A524]/80">
              Esto sobreescribirá todos los datos actuales. El sistema se guarda antes de restaurar.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => { void handleRestore(); }}
                disabled={restoring}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5A524]/20 px-4 py-2 text-sm font-bold text-[#F5A524] ring-1 ring-[#F5A524]/30 transition hover:bg-[#F5A524]/30 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {restoring ? "Restaurando…" : "Sí, restaurar"}
              </button>
              <button
                type="button"
                onClick={() => { setRestoreFile(null); setRestoreMsg(null); }}
                className="rounded-xl border border-[#3F3F46] px-4 py-2 text-sm font-semibold text-[#888888] transition hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {/* Mensajes de restauración */}
        {restoreMsg ? (
          <p className={`mt-2 text-xs font-semibold ${restoreMsg.ok ? "text-[#4ADE80]" : "text-danger"}`}>
            {restoreMsg.text}
          </p>
        ) : null}
      </div>

      {/* ── Panel Gestión de Consecutivos ── */}
      <div className="rounded-2xl border border-accent/20 bg-[#1E1E20] p-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#888888]">
          Folio de proyectos — control del consecutivo
        </p>
        <div className="mb-3 flex items-center gap-3">
          <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-2 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-accent/60">Siguiente folio</p>
            <p className="text-2xl font-black tabular-nums text-accent">
              {sequenceInfo ? sequenceInfo.display : "—"}
            </p>
          </div>
          <div className="text-xs text-[#555555] leading-relaxed">
            <p> Se asignará automáticamente al próximo proyecto nuevo</p>
          </div>
        </div>
        <p className="mb-2 text-xs font-semibold text-[#888888]">Ajustar el siguiente folio manualmente:</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            placeholder={sequenceInfo ? String(sequenceInfo.next) : "4000"}
            value={seqInput}
            onChange={(e) => setSeqInput(e.target.value.replace(/\D/g, ""))}
            className="w-32 rounded-xl border border-[#3F3F46] bg-[#27272A] px-3 py-2 text-sm font-bold tabular-nums text-foreground placeholder:text-[#555555] focus:border-accent/50 focus:outline-none"
          />
          <button
            type="button"
            disabled={seqSaving || !seqInput || Number(seqInput) < 1}
            onClick={async () => {
              const val = Number(seqInput);
              if (!val || val < 1 || !onSetSequenceCounter) return;
              setSeqSaving(true);
              setSeqMsg(null);
              try {
                await onSetSequenceCounter(val - 1);
                setSeqMsg({ text: `✓ Consecutivo fijado — el siguiente proyecto será #${String(val).padStart(4, "0")}`, ok: true });
                setSeqInput("");
              } catch {
                setSeqMsg({ text: "Error al guardar. Intenta de nuevo.", ok: false });
              } finally {
                setSeqSaving(false);
              }
            }}
            className="rounded-xl bg-accent/15 px-4 py-2 text-sm font-bold text-accent ring-1 ring-accent/30 transition hover:bg-accent/25 disabled:opacity-40"
          >
            {seqSaving ? "Guardando…" : "Aplicar"}
          </button>
        </div>
        {seqMsg ? (
          <p className={`mt-2 text-xs font-semibold ${seqMsg.ok ? "text-[#4ADE80]" : "text-danger"}`}>
            {seqMsg.text}
          </p>
        ) : null}
      </div>

      {/* ── Panel Limpieza de datos de prueba (borrado masivo, irreversible) ── */}
      <div className="rounded-2xl border border-danger/25 bg-[#1E1E20] p-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-danger">
          Limpieza de datos de prueba
        </p>
        <p className="mb-3 text-xs leading-relaxed text-[#71717A]">
          Borra permanentemente los proyectos con folio menor al que indiques (o sin folio asignado),
          junto con sus archivos y chat, y las solicitudes que no queden ligadas a un proyecto que
          sobreviva. Esta acción no se puede deshacer.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            placeholder="Ej. 4100"
            value={cleanupInput}
            onChange={(e) => { setCleanupInput(e.target.value.replace(/\D/g, "")); setCleanupMsg(null); }}
            className="w-32 rounded-xl border border-[#3F3F46] bg-[#27272A] px-3 py-2 text-sm font-bold tabular-nums text-foreground placeholder:text-[#555555] focus:border-danger/50 focus:outline-none"
          />
          <button
            type="button"
            disabled={cleanupBusy || !cleanupInput || Number(cleanupInput) < 1 || !onBulkDeleteBeforeFolio}
            onClick={async () => {
              const threshold = Number(cleanupInput);
              if (!threshold || threshold < 1 || !onBulkDeleteBeforeFolio) return;

              const survivingIds = new Set(
                projects.filter((p) => getProjectSequenceNumber(p) >= threshold).map((p) => p.id),
              );
              const willDeleteProjects = projects.filter((p) => getProjectSequenceNumber(p) < threshold).length;
              const willDeleteRequests = requests.filter(
                (r) => !r.linkedProjectId || !survivingIds.has(r.linkedProjectId),
              ).length;

              const sure = window.confirm(
                `Vas a borrar PERMANENTEMENTE ${willDeleteProjects} proyecto(s) con folio menor a ${threshold} ` +
                `y ${willDeleteRequests} solicitud(es) no ligadas a un proyecto que sobreviva.\n\n` +
                `Incluye sus archivos y mensajes de chat. Esta acción NO se puede deshacer.\n\n` +
                `¿Confirmas que quieres continuar?`,
              );
              if (!sure) return;

              setCleanupBusy(true);
              setCleanupMsg(null);
              try {
                const result = await onBulkDeleteBeforeFolio(threshold);
                setCleanupMsg({
                  text: `✓ Se borraron ${result.deletedProjects} proyecto(s) y ${result.deletedRequests} solicitud(es).`,
                  ok: true,
                });
                setCleanupInput("");
              } catch (err) {
                setCleanupMsg({ text: err instanceof Error ? err.message : "Error al borrar. Intenta de nuevo.", ok: false });
              } finally {
                setCleanupBusy(false);
              }
            }}
            className="rounded-xl bg-danger/15 px-4 py-2 text-sm font-bold text-danger ring-1 ring-danger/30 transition hover:bg-danger/25 disabled:opacity-40"
          >
            {cleanupBusy ? "Borrando…" : "Borrar anteriores a este folio"}
          </button>
        </div>
        {cleanupMsg ? (
          <p className={`mt-2 text-xs font-semibold ${cleanupMsg.ok ? "text-[#4ADE80]" : "text-danger"}`}>
            {cleanupMsg.text}
          </p>
        ) : null}
      </div>

      {/* ── Panel Funciones — switches globales que solo el Gestor puede prender/apagar.
          Por ahora solo "Apartado facturas"; futuros switches van como filas nuevas aca. ── */}
      <div className="rounded-2xl border border-[#3F3F46] bg-[#1E1E20] p-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#888888]">Funciones</p>
        <p className="mb-3 text-xs leading-relaxed text-[#71717A]">
          Switches globales que afectan lo que ven todos los perfiles. Se guardan en el servidor.
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#3F3F46] bg-[#27272A] px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Apartado facturas</span>
            <button
              type="button"
              onClick={() => onSetAppSetting?.("facturasEnabled", !(appSettings?.facturasEnabled ?? false))}
              title={appSettings?.facturasEnabled ? "Apartado facturas activado" : "Activar apartado facturas"}
              className={`relative flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors duration-200 ${
                appSettings?.facturasEnabled ? "bg-[#F5A524]" : "bg-[#3F3F46]"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                  appSettings?.facturasEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#3F3F46] bg-[#27272A] px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Cobros</span>
            <button
              type="button"
              onClick={() => onSetAppSetting?.("cobrosEnabled", !(appSettings?.cobrosEnabled ?? false))}
              title={appSettings?.cobrosEnabled ? "Cobros activado" : "Activar Cobros"}
              className={`relative flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors duration-200 ${
                appSettings?.cobrosEnabled ? "bg-[#F5A524]" : "bg-[#3F3F46]"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                  appSettings?.cobrosEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <Tabs
        value={systemTab}
        onValueChange={onTabChange}
        options={[
          { key: "projects", label: "Proyectos", count: activeProjects.length },
          { key: "requests", label: "Solicitudes", count: requests.length },
          { key: "users", label: "Usuarios", count: users.length },
          { key: "activity", label: "Actividad", count: activityLogs.length },
        ]}
      />

      {systemTab === "projects" ? (
        <ProjectsManager
          projects={activeProjects}
          trashedProjects={trashedProjects}
          trashTtlMs={TRASH_TTL_MS}
          users={users}
          nextSequence={sequenceInfo?.next}
          onCreateProject={onCreateProject}
          onDeleteProject={onDeleteProject}
          onRestoreProject={onRestoreProject}
          onPermanentDeleteProject={onPermanentDeleteProject}
          onOpenProject={onOpenProject}
        />
      ) : null}

      {systemTab === "requests" ? (
        <RequestsManager
          requests={requests}
          projects={projects}
          users={users}
          onCreateRequest={onCreateRequest}
          onDeleteRequest={onDeleteRequest}
          onOpenRequest={onOpenRequest}
          onApproveRequest={onApproveRequest}
          onRejectRequest={onRejectRequest}
        />
      ) : null}

      {systemTab === "users" ? (
        <UsersAdminPanel
          users={users}
          canManageUsers
          onCreateUser={onCreateUser}
          onUpdateUser={onUpdateUser}
          onDeleteUser={onDeleteUser}
        />
      ) : null}

      {systemTab === "activity" ? (
        <ActivityPanel activityLogs={activityLogs} />
      ) : null}
    </section>
  );
}

function SummaryCard({ title, value, tone }: { title: string; value: number | string; tone: "accent" | "warning" | "secondary" | "danger" }): JSX.Element {
  const toneClass = {
    accent: "border-accent/20 text-accent",
    warning: "border-warning/20 text-[#F5A524]",
    secondary: "border-secondary/20 text-secondary",
    danger: "border-danger/20 text-danger",
  }[tone];

  return (
    <Card className={`border bg-[#27272A] ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-[0.18em]">{title}</p>
      <p className="mt-3 text-3xl font-bold tabular-nums text-foreground">{value}</p>
    </Card>
  );
}

function ProjectsManager({
  projects,
  trashedProjects,
  trashTtlMs,
  users,
  nextSequence,
  onCreateProject,
  onDeleteProject,
  onRestoreProject,
  onPermanentDeleteProject,
  onOpenProject,
}: {
  projects: ProjectItem[];
  trashedProjects: ProjectItem[];
  trashTtlMs: number;
  users: UserItem[];
  nextSequence?: number;
  onCreateProject: AdminViewProps["onCreateProject"];
  onDeleteProject: AdminViewProps["onDeleteProject"];
  onRestoreProject?: (id: string) => void;
  onPermanentDeleteProject?: (id: string) => void;
  onOpenProject: AdminViewProps["onOpenProject"];
}): JSX.Element {
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const engineerUsers = useMemo(() => users.filter((user) => user.role === "engineer" && user.isActive !== false), [users]);
  const [draft, setDraft] = useState({
    sequence: "",
    baseName: "",
    client: "",
    department: "",
    lugar: "",
    type: "INST" as ProjectType,
    description: "",
    status: "en-programacion" as ProjectStatus,
    paymentStatus: "unpaid" as ProjectItem["paymentStatus"],
    tipoPago: "concurso" as TipoPago,
    priority: "medium" as ProjectItem["priority"],
    totalContratado: "",
    assignedEngineerId: "",
  });

  // Autocompleta el Consecutivo con el siguiente folio real (mismo valor que muestra el
  // panel "Gestión de Consecutivos"). Antes este campo era texto libre desconectado del
  // contador, lo que causaba folios manuales que no coincidían con lo que el gestor acababa
  // de fijar ahí. Solo llena si el campo está vacío — no pisa un valor que el usuario ya
  // esté escribiendo, y se re-dispara cada vez que nextSequence avanza (tras crear otro
  // proyecto o ajustar el contador manualmente).
  useEffect(() => {
    if (nextSequence == null) return;
    setDraft((current) => (current.sequence === "" ? { ...current, sequence: String(nextSequence) } : current));
  }, [nextSequence]);

  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) => {
        const delta = Number(getProjectSequence(a)) - Number(getProjectSequence(b));
        return direction === "asc" ? delta : -delta;
      }),
    [direction, projects],
  );
  const sequenceExists = projects.some((project) => getProjectSequence(project) === draft.sequence.padStart(4, "0"));

  const create = (): void => {
    if (!draft.sequence.trim() || !draft.baseName.trim() || !draft.client.trim() || !draft.department.trim() || !draft.description.trim()) {
      return;
    }

    onCreateProject({
      ...draft,
      sequence: draft.sequence.trim(),
      baseName: draft.baseName.trim(),
      client: draft.client.trim(),
      department: draft.department.trim(),
      lugar: draft.lugar.trim() || undefined,
      description: draft.description.trim(),
      totalContratado: Number(draft.totalContratado) || 0,
      assignedEngineerId: draft.assignedEngineerId || undefined,
    });
    setDraft((current) => ({ ...current, sequence: "", baseName: "", description: "", lugar: "", totalContratado: "", assignedEngineerId: "" }));
  };

  return (
    <div className="space-y-4">
      <Card className="border-accent/15 bg-accent/[0.05]">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-accent">
          <Plus className="h-4 w-4" />
          Alta manual de proyecto
        </div>
        <div className="grid gap-3 lg:grid-cols-[0.45fr_1fr_0.7fr_0.7fr]">
          <Input value={draft.sequence} onChange={(event) => setDraft((c) => ({ ...c, sequence: event.target.value.replace(/\D/g, "") }))} placeholder="Consecutivo" />
          <Input value={draft.baseName} onChange={(event) => setDraft((c) => ({ ...c, baseName: event.target.value }))} placeholder="Nombre del proyecto" />
          <Input value={draft.client} onChange={(event) => setDraft((c) => ({ ...c, client: event.target.value }))} placeholder="Cliente" />
          <Input value={draft.department} onChange={(event) => setDraft((c) => ({ ...c, department: event.target.value }))} placeholder="Departamento" />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_0.6fr]">
          <Input value={draft.lugar} onChange={(event) => setDraft((c) => ({ ...c, lugar: event.target.value }))} placeholder="Lugar (ej. AULAS 2, Planta Norte...)" />
          <Input value={draft.totalContratado} onChange={(event) => setDraft((c) => ({ ...c, totalContratado: event.target.value }))} type="number" placeholder="Monto" />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <select value={draft.type} onChange={(event) => setDraft((c) => ({ ...c, type: event.target.value as ProjectType }))} className="h-12 rounded-2xl border border-[#3F3F46] bg-[#313136] px-4 text-sm font-semibold text-foreground outline-none">
            {(Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]).map(([code, label]) => (
              <option key={code} value={code}>{code} — {label}</option>
            ))}
          </select>
          <select value={draft.assignedEngineerId} onChange={(event) => setDraft((c) => ({ ...c, assignedEngineerId: event.target.value }))} className="h-12 rounded-2xl border border-[#3F3F46] bg-[#313136] px-4 text-sm font-semibold text-foreground outline-none">
            <option value="">Sin ingeniero asignado</option>
            {engineerUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-4">
          <select value={draft.status} onChange={(event) => setDraft((c) => ({ ...c, status: event.target.value as ProjectStatus }))} className="h-12 rounded-2xl border border-[#3F3F46] bg-[#313136] px-4 text-sm font-semibold text-foreground outline-none">
            <option value="en-programacion">En programación</option>
            <option value="en-concurso">En concurso</option>
            <option value="in-progress">En proceso</option>
            <option value="pendiente-aprobacion">Pend. aprobación</option>
            <option value="pendiente-autorizar">Pend. autorizar</option>
            <option value="reasignado">Reasignado</option>
            <option value="comparativa">Comparativa</option>
            <option value="cierre-por-sistema">Cierre por sistema</option>
            <option value="no-autorizado">No autorizado</option>
            <option value="completed">Terminado</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <select value={draft.tipoPago} onChange={(event) => setDraft((c) => ({ ...c, tipoPago: event.target.value as TipoPago }))} className="h-12 rounded-2xl border border-[#3F3F46] bg-[#313136] px-4 text-sm font-semibold text-foreground outline-none">
            {(Object.entries(TIPO_PAGO_LABELS) as [TipoPago, string][]).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select value={draft.paymentStatus} onChange={(event) => setDraft((c) => ({ ...c, paymentStatus: event.target.value as ProjectItem["paymentStatus"] }))} className="h-12 rounded-2xl border border-[#3F3F46] bg-[#313136] px-4 text-sm font-semibold text-foreground outline-none">
            <option value="unpaid">No pagado</option>
            <option value="partial">Pago parcial</option>
            <option value="paid">Pagado</option>
          </select>
          <select value={draft.priority} onChange={(event) => setDraft((c) => ({ ...c, priority: event.target.value as ProjectItem["priority"] }))} className="h-12 rounded-2xl border border-[#3F3F46] bg-[#313136] px-4 text-sm font-semibold text-foreground outline-none">
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
        </div>
        <Textarea value={draft.description} onChange={(event) => setDraft((c) => ({ ...c, description: event.target.value }))} placeholder="Descripcion, antecedente o motivo de alta" className="mt-3" />
        {sequenceExists && draft.sequence ? <p className="mt-3 text-sm font-semibold text-danger">Ese consecutivo ya existe. Cada numero solo puede usarse una vez.</p> : null}
        <div className="mt-4 flex justify-end">
          <Button onClick={create} disabled={sequenceExists || !draft.sequence || !draft.baseName || !draft.client || !draft.department || !draft.description}>
            <Plus className="h-4 w-4" />
            Crear proyecto
          </Button>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-sm text-[#888888]">{sortedProjects.length} proyectos activos</span>
        <Button variant="outline" onClick={() => setDirection((current) => (current === "asc" ? "desc" : "asc"))}>
          Orden {direction === "asc" ? "ascendente" : "descendente"}
        </Button>
      </div>

      <div className="space-y-3">
        {sortedProjects.map((project) => {
          const assignedEngineer = users.find(
            (user) => user.role === "engineer" && (user.id === project.createdBy || (project.participants ?? []).includes(user.id)),
          );
          return (
            <Card key={project.id} className="border-[#3F3F46] bg-[#27272A]">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-accent px-3 py-1 text-xs font-black text-[#111111]">#{getProjectSequence(project)}</span>
                    <StatusBadge kind="project" value={project.status} />
                    <StatusBadge kind="payment" value={project.paymentStatus} />
                    <PriorityBadge priority={project.priority} />
                    {!assignedEngineer ? <span className="rounded-full bg-[#F5A524]/15 px-3 py-1 text-xs font-bold text-[#F5A524] ring-1 ring-[#F5A524]/25">Sin ingeniero</span> : null}
                  </div>
                  <p className="mt-2 truncate text-lg font-semibold text-foreground">{project.baseName}</p>
                  <p className="mt-1 text-sm text-[#888888]">{project.client} · {project.department} · {project.structuredName}</p>
                  <div className="mt-3 grid gap-2 text-xs text-[#A1A1AA] sm:grid-cols-2">
                    <span>Ingeniero: {assignedEngineer?.name ?? "Pendiente asignar"}</span>
                    <span>Creado: {formatCompactDate(project.createdAt)}</span>
                    <span>Compromiso: {project.commitmentDate ? formatCompactDate(project.commitmentDate) : "Pendiente"}</span>
                    <span>Actualizado: {formatCompactDate(project.updatedAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => onOpenProject(project.id)}><Eye className="h-4 w-4" />Abrir</Button>
                  <div className="relative">
                    <Button variant="outline" onClick={() => setOpenMenuId(openMenuId === project.id ? null : project.id)} aria-label="Más acciones">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                    {openMenuId === project.id ? (
                      <div className="absolute right-0 top-full z-20 mt-1.5 min-w-[160px] rounded-2xl border border-[#3F3F46] bg-[#1E1E20] p-1.5 shadow-xl">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-danger transition-colors duration-150 hover:bg-danger/10"
                          onClick={() => { onDeleteProject(project.id); setOpenMenuId(null); }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Mover a papelera
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ── Papelera ── */}
      {trashedProjects.length > 0 ? (
        <div className="space-y-3 rounded-[28px] border border-dashed border-danger/30 p-4">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-danger" />
            <p className="text-sm font-bold text-danger">Papelera — {trashedProjects.length} proyecto{trashedProjects.length !== 1 ? "s" : ""}</p>
            <p className="text-xs text-[#555555]">Se eliminan automáticamente después de 4 horas</p>
          </div>
          {trashedProjects.map((project) => {
            const deletedMs = project.deletedAt ? Date.now() - new Date(project.deletedAt).getTime() : 0;
            const remainingMs = Math.max(0, trashTtlMs - deletedMs);
            const remainingHrs = Math.floor(remainingMs / 3600000);
            const remainingMins = Math.floor((remainingMs % 3600000) / 60000);
            const timeLabel = remainingMs === 0 ? "Expira pronto" : remainingHrs > 0 ? `${remainingHrs}h ${remainingMins}m restantes` : `${remainingMins}m restantes`;
            return (
              <Card key={project.id} className="border-danger/20 bg-danger/5 opacity-80">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#3F3F46] px-2 py-0.5 text-xs font-black text-accent">#{getProjectSequence(project)}</span>
                      <p className="truncate text-sm font-semibold text-[#A1A1AA]">{project.baseName}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-[#555555]">{project.client} · {project.department}</p>
                    <p className="mt-1 text-xs text-[#555555]">⏱ {timeLabel}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => onRestoreProject?.(project.id)}
                      className="rounded-xl border border-[#3F3F46] px-3 py-1.5 text-xs font-bold text-[#A1A1AA] transition hover:border-accent/40 hover:text-accent"
                    >
                      Restaurar
                    </button>
                    <button
                      type="button"
                      onClick={() => onPermanentDeleteProject?.(project.id)}
                      className="rounded-xl bg-danger/15 px-3 py-1.5 text-xs font-bold text-danger transition hover:bg-danger/30"
                    >
                      Eliminar definitivo
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function RequestsManager({
  requests,
  projects,
  users,
  onCreateRequest,
  onDeleteRequest,
  onOpenRequest,
  onApproveRequest,
  onRejectRequest,
}: {
  requests: RequestItem[];
  projects: ProjectItem[];
  users: UserItem[];
  onCreateRequest: AdminViewProps["onCreateRequest"];
  onDeleteRequest: AdminViewProps["onDeleteRequest"];
  onOpenRequest: AdminViewProps["onOpenRequest"];
  onApproveRequest?: AdminViewProps["onApproveRequest"];
  onRejectRequest?: AdminViewProps["onRejectRequest"];
}): JSX.Element {
  const [openMenuReqId, setOpenMenuReqId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reqQuery, setReqQuery] = useState("");
  const [draft, setDraft] = useState({
    baseName: "",
    client: "",
    department: "",
    type: "INST" as ProjectType,
    description: "",
    createdBy: users[0]?.id ?? "",
    status: "under-review" as RequestStatus,
  });

  const create = (): void => {
    if (!draft.baseName.trim() || !draft.client.trim() || !draft.department.trim() || !draft.description.trim()) {
      return;
    }

    onCreateRequest({
      ...draft,
      baseName: draft.baseName.trim(),
      client: draft.client.trim(),
      department: draft.department.trim(),
      description: draft.description.trim(),
    });
    setDraft((current) => ({ ...current, baseName: "", description: "" }));
  };

  const sortedRequests = useMemo(() => {
    const q = reqQuery.trim().toLowerCase();
    const filtered = q
      ? requests.filter((r) => [r.baseName, r.client, getRequestSequence(r, projects)].some((f) => f.toLowerCase().includes(q)))
      : requests;
    return [...filtered].sort((a, b) => {
      const diff = getRequestSequenceNumber(b, projects) - getRequestSequenceNumber(a, projects);
      return diff !== 0 ? diff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [requests, projects, reqQuery]);

  return (
    <div className="space-y-4">
      <Card className="border-warning/15 bg-warning/[0.05]">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#F5A524]">
          <Plus className="h-4 w-4" />
          Alta manual de solicitud
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_0.8fr_0.8fr_0.55fr_0.8fr]">
          <Input value={draft.baseName} onChange={(event) => setDraft((c) => ({ ...c, baseName: event.target.value }))} placeholder="Nombre de solicitud" />
          <Input value={draft.client} onChange={(event) => setDraft((c) => ({ ...c, client: event.target.value }))} placeholder="Cliente" />
          <Input value={draft.department} onChange={(event) => setDraft((c) => ({ ...c, department: event.target.value }))} placeholder="Departamento" />
          <select value={draft.type} onChange={(event) => setDraft((c) => ({ ...c, type: event.target.value as ProjectType }))} className="h-12 rounded-2xl border border-[#3F3F46] bg-[#313136] px-4 text-sm font-semibold text-foreground outline-none">
            {(Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]).map(([code, label]) => (
              <option key={code} value={code}>{code} — {label}</option>
            ))}
          </select>
          <select value={draft.status} onChange={(event) => setDraft((c) => ({ ...c, status: event.target.value as RequestStatus }))} className="h-12 rounded-2xl border border-[#3F3F46] bg-[#313136] px-4 text-sm font-semibold text-foreground outline-none">
            <option value="under-review">Por revisar</option>
            <option value="needs-correction">Correccion</option>
            <option value="approved">Aprobada</option>
            <option value="rejected">Rechazada</option>
          </select>
        </div>
        <select value={draft.createdBy} onChange={(event) => setDraft((c) => ({ ...c, createdBy: event.target.value }))} className="mt-3 h-12 w-full rounded-2xl border border-[#3F3F46] bg-[#313136] px-4 text-sm font-semibold text-foreground outline-none">
          {users.filter((user) => user.isActive !== false).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
        <Textarea value={draft.description} onChange={(event) => setDraft((c) => ({ ...c, description: event.target.value }))} placeholder="Descripcion o seguimiento solicitado" className="mt-3" />
        <div className="mt-4 flex justify-end">
          <Button onClick={create} disabled={!draft.baseName || !draft.client || !draft.department || !draft.description}>
            <Plus className="h-4 w-4" />
            Crear solicitud
          </Button>
        </div>
      </Card>

      {requests.length > 0 ? (
        <Input
          value={reqQuery}
          onChange={(e) => setReqQuery(e.target.value)}
          placeholder="Buscar por N° proyecto, nombre o cliente…"
          className="h-11"
        />
      ) : null}

      <div className="space-y-3">
        {sortedRequests.length === 0 && requests.length > 0 ? (
          <p className="py-6 text-center text-sm text-[#888888]">Sin resultados para la búsqueda</p>
        ) : null}
        {sortedRequests.map((request) => (
          <Card key={request.id} className="border-[#3F3F46] bg-[#27272A]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-black text-accent">#{request.status === "approved" ? getRequestSequence(request, projects) : "XXXX"}</span>
                  <StatusBadge kind="request" value={request.status} />
                  <span className="text-xs font-semibold text-[#888888]">{parseLocalDate(request.createdAt).toLocaleDateString("es-MX")}</span>
                </div>
                <p className="mt-2 text-base font-semibold text-foreground">{request.baseName}</p>
                <p className="mt-1 text-sm text-[#888888]">
                  {request.client} · {request.department} · {request.status === "approved" ? request.structuredName : maskRequestSequence(request.structuredName)}
                </p>
                <div className="mt-3 grid gap-2 text-xs text-[#A1A1AA] sm:grid-cols-2 lg:grid-cols-4">
                  <span>Solicitó: {users.find((user) => user.id === request.createdBy)?.name ?? request.createdBy}</span>
                  <span>Tipo: {request.type}</span>
                  <span>Vínculo: {request.linkedProjectId ? "Proyecto aprobado" : request.duplicateOfProjectId ? "Posible duplicado" : "Sin vínculo"}</span>
                  <span className="truncate">Descripción: {request.description}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {request.status === "under-review" && onApproveRequest ? (
                  <button
                    type="button"
                    onClick={() => onApproveRequest(request.id)}
                    className="flex items-center gap-1.5 rounded-xl bg-[#166534]/20 px-3 py-1.5 text-sm font-bold text-[#4ADE80] ring-1 ring-[#4ADE80]/20 transition hover:bg-[#166534]/40"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Aprobar
                  </button>
                ) : null}
                {request.status === "under-review" && onRejectRequest && rejectingId !== request.id ? (
                  <button
                    type="button"
                    onClick={() => { setRejectingId(request.id); setRejectReason(""); }}
                    className="flex items-center gap-1.5 rounded-xl bg-danger/10 px-3 py-1.5 text-sm font-bold text-danger ring-1 ring-danger/20 transition hover:bg-danger/20"
                  >
                    <X className="h-3.5 w-3.5" />
                    Rechazar
                  </button>
                ) : null}
                {rejectingId === request.id ? (
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Motivo..."
                      className="h-9 rounded-xl border border-[#3F3F46] bg-[#1F1F22] px-3 text-sm text-foreground outline-none focus:border-danger/50"
                      autoFocus
                    />
                    <button
                      type="button"
                      disabled={!rejectReason.trim()}
                      onClick={() => { onRejectRequest?.(request.id, rejectReason.trim()); setRejectingId(null); setRejectReason(""); }}
                      className="rounded-xl bg-danger/15 px-3 py-1.5 text-sm font-bold text-danger transition hover:bg-danger/25 disabled:opacity-40"
                    >Confirmar</button>
                    <button
                      type="button"
                      onClick={() => setRejectingId(null)}
                      className="rounded-xl border border-[#3F3F46] px-3 py-1.5 text-sm font-bold text-[#888888] transition hover:text-white"
                    >Cancelar</button>
                  </div>
                ) : null}
                <Button variant="outline" onClick={() => onOpenRequest(request.id)}><Eye className="h-4 w-4" />Abrir</Button>
                <div className="relative">
                  <Button variant="outline" onClick={() => setOpenMenuReqId(openMenuReqId === request.id ? null : request.id)} aria-label="Más acciones">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                  {openMenuReqId === request.id ? (
                    <div className="absolute right-0 top-full z-20 mt-1.5 min-w-[160px] rounded-2xl border border-[#3F3F46] bg-[#1E1E20] p-1.5 shadow-xl">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-danger transition-colors duration-150 hover:bg-danger/10"
                        onClick={() => { onDeleteRequest(request.id); setOpenMenuReqId(null); }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function LegacyAdminView({
  tab,
  onTabChange,
  activeUserName,
  reviewRequests,
  activeProjects,
  completedProjects,
  cancelledProjects,
  paidProjects,
  unpaidProjects,
  rejectedRequests,
  correctionRequests,
  projects,
  requests,
  users,
  appSettings,
  onOpenRequest,
  onOpenProject,
  onApproveRequest,
  onRejectRequest,
  onCorrectionRequest,
  onReactivateRequest,
}: AdminViewProps): JSX.Element {
  const cobrosEnabled = appSettings?.cobrosEnabled ?? false;
  const CLOSED_STATUSES_ADMIN = ["completed", "cancelled", "no-autorizado", "cierre-por-sistema"];
  // Directo desde `projects` (todos, sin filtrar por status) en vez de unir activos+terminados+
  // cancelados: un proyecto con un status que no cae en ninguna de esas 3 categorias (dato raro)
  // desaparecia de "Todos los proyectos" aunque siguiera contando en tarjetas como "No pagados".
  const allNonDeletedProjects = projects.filter((p) => !p.deletedAt);
  const terminatedProjects = allNonDeletedProjects.filter((p) => CLOSED_STATUSES_ADMIN.includes(p.status));
  const onlyActiveProjects = allNonDeletedProjects.filter((p) => !CLOSED_STATUSES_ADMIN.includes(p.status));

  const adminProjectTab: AdminTab = tab === "active" || tab === "completed" || tab === "review" || (tab === "cobros" && cobrosEnabled) || tab === "correction" || tab === "calendar" ? tab : "allprojects";

  const cobrosProjects = allNonDeletedProjects.filter((p) => (p.invoices?.length ?? 0) > 0);
  const activeInvoiceCount = cobrosProjects.reduce(
    (sum, p) => sum + (p.invoices ?? []).filter((inv) => inv.status !== "pagada" && inv.status !== "cancelada").length,
    0,
  );

  // Filtro de Pago que las tarjetas "Pagados"/"No pagados" empujan hacia "Todos los proyectos".
  // `payFilterNonce` fuerza un remount de ProjectsFilterTab (via key) aunque ya estemos en esa
  // pestaña, porque su estado de filtros es interno y solo se inicializa una vez al montar.
  const [pendingPayFilter, setPendingPayFilter] = useState<string | undefined>(undefined);
  const [payFilterNonce, setPayFilterNonce] = useState(0);
  const goToAllProjectsWithPayFilter = (value: string): void => {
    onTabChange("allprojects");
    setPendingPayFilter(value);
    setPayFilterNonce((n) => n + 1);
  };

  const summaryCards = [
    {
      title: "Por revisar", value: reviewRequests.length, icon: ShieldAlert,
      bg: "bg-gradient-to-br from-[#2C2C30] to-[#212124]", border: "border-[#F5A524]/20", iconBg: "bg-[#F5A524]/15 text-[#F5A524]", labelColor: "text-[#F5A524]", accent: "bg-warning",
      onClick: () => onTabChange("review"),
    },
    {
      title: "Proyectos activos", value: onlyActiveProjects.length, icon: FolderOpenDot,
      bg: "bg-gradient-to-br from-[#2C2C30] to-[#212124]", border: "border-secondary/20", iconBg: "bg-secondary/15 text-secondary", labelColor: "text-secondary", accent: "bg-secondary",
      onClick: () => onTabChange("active"),
    },
    {
      // Mismos color/icono que "Pagados" del Supervisor — los 4 indicadores deben
      // verse identicos entre ambos roles.
      title: "Pagados", value: paidProjects.length, icon: BadgeCheck,
      bg: "bg-gradient-to-br from-[#2C2C30] to-[#212124]", border: "border-[#2DBE7A]/20", iconBg: "bg-[#2DBE7A]/15 text-[#2DBE7A]", labelColor: "text-[#2DBE7A]", accent: "bg-[#2DBE7A]",
      onClick: () => goToAllProjectsWithPayFilter("Pagado"),
    },
    {
      title: "No pagados", value: unpaidProjects.length, icon: BadgeDollarSign,
      bg: "bg-gradient-to-br from-[#2C2C30] to-[#212124]", border: "border-danger/20", iconBg: "bg-danger/15 text-danger", labelColor: "text-danger", accent: "bg-danger",
      onClick: () => goToAllProjectsWithPayFilter("No pagado"),
    },
  ];

  return (
    <section className="space-y-6">
      <SectionTitle eyebrow={`Espacio de trabajo de ${activeUserName}`} title="Centro de revision administrativa" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card
            key={card.title}
            onClick={card.onClick}
            className={cn(
              "relative overflow-hidden border ring-1 ring-inset ring-white/[0.04] transition-all duration-200",
              card.bg,
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
        value={adminProjectTab}
        onValueChange={onTabChange}
        options={[
          { key: "allprojects", label: "Todos", count: allNonDeletedProjects.length },
          { key: "active", label: "No concluidos", count: onlyActiveProjects.length },
          { key: "completed", label: "Concluidos", count: terminatedProjects.length },
          ...(cobrosEnabled ? [{ key: "cobros" as const, label: "Cobros", count: activeInvoiceCount }] : []),
          { key: "review", label: "Solicitudes", count: reviewRequests.length },
          { key: "correction", label: "En corrección", count: correctionRequests?.length ?? 0 },
          { key: "calendar", label: "Calendario", count: allNonDeletedProjects.reduce((n, p) => n + (p.endDate ? 1 : 0) + (p.commitmentDate ? 1 : 0) + (p.startDate ? 1 : 0) + (p.fechaSolicitud ? 1 : 0) + (p.importantDates?.length ?? 0), 0) },
        ]}
      />
      {adminProjectTab === "allprojects" ? (
        <ProjectsFilterTab
          key={payFilterNonce}
          projects={allNonDeletedProjects}
          users={users}
          onOpenProject={onOpenProject}
          initialPayFilter={pendingPayFilter}
        />
      ) : null}
      {adminProjectTab === "active" ? <ProjectsFilterTab projects={onlyActiveProjects} users={users} onOpenProject={onOpenProject} /> : null}
      {adminProjectTab === "completed" ? <ProjectsFilterTab projects={terminatedProjects} users={users} onOpenProject={onOpenProject} /> : null}
      {adminProjectTab === "cobros" ? <CobrosTab projects={allNonDeletedProjects} onOpenProject={onOpenProject} /> : null}
      {adminProjectTab === "review" ? (
        <ReviewTab
          reviewRequests={reviewRequests}
          users={users}
          projects={projects ?? []}
          requests={requests ?? []}
          onOpenRequest={onOpenRequest ?? (() => {})}
          onApproveRequest={onApproveRequest}
          onRejectRequest={onRejectRequest}
          onCorrectionRequest={onCorrectionRequest}
        />
      ) : null}
      {adminProjectTab === "calendar" ? (
        <ProjectCalendar
          projects={allNonDeletedProjects}
          onOpenProject={onOpenProject ?? (() => {})}
          users={users}
        />
      ) : null}
      {adminProjectTab === "correction" ? (
        <div className="space-y-3">
          {(correctionRequests ?? []).length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-[#3F3F46] py-16 text-center">
              <p className="text-sm font-semibold text-[#888888]">Sin solicitudes en corrección</p>
            </div>
          ) : (
            (correctionRequests ?? []).map((req) => (
              <div key={req.id} className="rounded-[20px] border border-[#0EA5E9]/25 bg-[#0c1f2e] p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind="request" value={req.status} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0EA5E9]">
                    {req.client} · {req.department}
                  </span>
                  <span className="ml-auto text-xs text-[#888888]">
                    {formatDate(req.createdAt)}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-foreground">{req.baseName}</h3>
                <p className="text-xs text-[#888888]">{req.structuredName ? maskRequestSequence(req.structuredName) : "Sin folio"}</p>
                {req.correctionReason ? (
                  <div className="rounded-xl border border-[#0EA5E9]/15 bg-[#0EA5E9]/5 px-3 py-2 text-xs text-[#A1A1AA]">
                    <span className="font-bold text-[#0EA5E9]">Corrección solicitada: </span>
                    {req.correctionReason}
                  </div>
                ) : null}
                <p className="text-xs text-[#888888]">
                  <span className="font-semibold text-[#A1A1AA]">Solicitado por:</span>{" "}
                  {users.find((u) => u.id === req.createdBy)?.name ?? "—"}
                </p>
              </div>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

// ── ReviewTab ─────────────────────────────────────────────────────────────────
function ReviewTab({
  reviewRequests, users, projects, requests, onOpenRequest,
  onApproveRequest, onRejectRequest, onCorrectionRequest,
}: {
  reviewRequests: RequestItem[];
  users: UserItem[];
  projects: ProjectItem[];
  requests: RequestItem[];
  onOpenRequest: (id: string) => void;
  onApproveRequest?: (id: string) => void;
  onRejectRequest?: (id: string, reason: string) => void;
  onCorrectionRequest?: (id: string, reason: string) => void;
}): JSX.Element {
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const nextSeq = useMemo(() => {
    const nums = [
      ...requests.map((r) => (r.sequence ? parseInt(r.sequence, 10) : NaN)),
      ...projects.map((p) => parseInt((p.structuredName ?? "").split("-")[0], 10)),
    ].filter(Number.isFinite);
    return String(Math.max(3999, ...nums) + 1).padStart(4, "0");
  }, [requests, projects]);

  if (reviewRequests.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-[#3F3F46] py-16 text-center">
        <p className="text-sm font-semibold text-[#888888]">No hay solicitudes por revisar</p>
      </div>
    );
  }

  return (
    <div className="card-grid">
      {reviewRequests.map((req) => (
        <AdminReviewCard
          key={req.id}
          request={req}
          onOpen={onOpenRequest}
          onApprove={onApproveRequest}
          onReject={onRejectRequest}
          onCorrection={onCorrectionRequest}
          requesterName={usersById[req.createdBy]?.name}
          // La solicitud ya reserva su propio folio desde que se crea (ver handleCreateRequest
          // en App.tsx) — mostrar eso, no "el siguiente disponible" calculado aqui, que ademas
          // era el MISMO numero para todas las tarjetas sin importar cual solicitud fuera.
          suggestedSequence={req.sequence ?? nextSeq}
        />
      ))}
    </div>
  );
}

// ── ProjectsFilterTab ──────────────────────────────────────────────────────────

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

const PRIORITY_DISPLAY: Record<string, string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
  critical: "Crítica",
};

const PAYMENT_DISPLAY: Record<string, string> = {
  unpaid: "No pagado",
  partial: "Pago parcial",
  paid: "Pagado",
};

const FOTOS_DISPLAY: Record<string, string> = {
  no: "No",
  "en-revision": "En revisión",
  si: "Si",
  rechazado: "Rechazado",
};

// Mismos 4 estados que Fotos — ligado a reporteFileStatus de Fase 2 ("Reporte generado").
const REPORTE_DISPLAY: Record<string, string> = {
  no: "No",
  "en-revision": "En revisión",
  si: "Si",
  rechazado: "Rechazado",
};

const SUBFACT_DISPLAY: Record<string, string> = { Pendiente: "No pagado", Pagado: "Pagado" };
// Mismas etiquetas que en Fase 4 del proyecto — "Sin Definir" es la ausencia de valor, no un
// texto libre, para que el filtro encuentre exactamente lo que se ve en el proyecto.
const MDP_OPTIONS = ["Todos", "Sin Definir", "PPD", "PUE"];
const FORMAPAGO_OPTIONS = ["Todos", "Sin definir", "Efectivo", "Transferencia", "Cheque"];
const PAGOFINAL_DISPLAY: Record<string, string> = { Pendiente: "No pagado", Pagado: "Pagado" };

function exportProjectsCSV(projects: ProjectItem[], users: UserItem[]): void {
  const priorityMap: Record<string, string> = { low: "Bajo", medium: "Medio", high: "Alto", critical: "Crítica" };
  const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("es-MX") : "");
  const num = (n?: number) => (n != null ? String(n) : "");
  const bool = (b?: boolean) => (b != null ? (b ? "Sí" : "No") : "");
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const headers = [
    // F1 — Apertura
    "Folio", "Nombre", "Cliente", "Departamento", "Tipo", "Urgencia",
    "Ingeniero asignado", "Negociador", "Usuario contacto", "Descripción",
    // F2 — Ejecución
    "Estado", "Estimación", "Cotización", "Estado pago",
    "Lugar",
    "Fecha solicitud", "Fecha inicio", "Fecha fin", "Fecha compromiso",
    "Fotos", "Reporte", "Autorizador", "Comentarios campo",
    // F3 — Financiero
    "Total sin IVA", "IVA", "Materiales", "Servicios", "Personal",
    "Svo contratado", "Comisión", "Otros gastos", "OAPC", "EGPC", "LUNA",
    "Pago Padillas", "Estatus trab.", "Estatus Alberto", "Estatus LUNA",
    "Comentarios dirección",
    // F4 — Pagos
    "Estatus final pagos", "Nº pagos", "Total abonado",
    // Meta
    "Fecha creación", "Total contratado",
  ];

  const rows = projects.map((p) => {
    const engineer = users.find(
      (u) => u.role === "engineer" && (u.id === p.createdBy || (p.participants ?? []).includes(u.id)),
    );
    const totalAbonado = (p.pagosProyecto ?? []).reduce((t, pg) => t + (pg.monto ?? 0), 0);
    return [
      q(p.structuredName?.split("-")[0] ?? ""),
      q(p.baseName), q(p.client), q(p.department), q(p.type),
      q(priorityMap[p.priority] ?? p.priority),
      q(engineer?.name ?? ""), q(p.negociador), q(p.usuarioContacto), q(p.description),
      q(p.status), q(p.estimacion), q(p.cotizacion), q(p.paymentStatus),
      q(p.lugar),
      q(fmt(p.fechaSolicitud)), q(fmt(p.startDate)), q(fmt(p.endDate)), q(fmt(p.commitmentDate)),
      q(p.fotosStatus ?? (p.fotos ? "si" : "no")),
      q(p.reporteFileStatus ?? (p.reporte ? "si" : "no")),
      q(p.autorizador), q(p.comentariosCampo),
      q(num(p.totalSinIva)), q(num(p.iva)),
      q(num(p.costoMateriales)), q(num(p.costoServicios)), q(num(p.costoPersonal)),
      q(num(p.costoSvoContratado)), q(num(p.costoComision)), q(num(p.costoOtros)),
      q(num(p.oapc)), q(num(p.egpc)), q(num(p.luna)),
      q(bool(p.pagoPadillas)),
      q(p.estatusPagoTrabajo), q(p.estatusPagoAlberto), q(p.estatusPagoLuna),
      q(p.comentariosDireccion),
      q(p.estatusPagoFinal),
      q((p.pagosProyecto ?? []).length), q(totalAbonado),
      q(fmt(p.createdAt)), q(num(p.totalContratado)),
    ].join(",");
  });

  const csv = "﻿" + [headers.map((h) => `"${h}"`).join(","), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `enerman-proyectos-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ProjectsFilterTab({
  projects, users, onOpenProject, initialPayFilter,
}: {
  projects: ProjectItem[];
  users: UserItem[];
  onOpenProject: (id: string) => void;
  initialPayFilter?: string;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [clientF, setClientF] = useState("Todos");
  const [deptF, setDeptF] = useState("Todos");
  const [typeF, setTypeF] = useState("Todos");
  const [urgencyF, setUrgencyF] = useState("Todos");
  const [engineerF, setEngineerF] = useState("Todos");
  const [statusF, setStatusF] = useState("Todos");
  const [estimF, setEstimF] = useState("Todos");
  const [cotizF, setCotizF] = useState("Todos");
  const [payF, setPayF] = useState(initialPayFilter ?? "Todos");
  const [fotosF, setFotosF] = useState("Todos");
  const [reporteF, setReporteF] = useState("Todos");
  const [subF, setSubF] = useState("Todos");
  const [subFacturaF, setSubFacturaF] = useState("Todos");
  const [mdpF, setMdpF] = useState("Todos");
  const [formaPagoF, setFormaPagoF] = useState("Todos");
  const [pagoFinalF, setPagoFinalF] = useState("Todos");
  const [yearF, setYearF] = useState("Todos");
  const [sortF, setSortF] = useState("Reciente ↓");
  // Acordeones de filtros — cerrados por defecto, cada grupo se abre/cierra independiente.
  const [openOperativo, setOpenOperativo] = useState(false);
  const [openAdministrativo, setOpenAdministrativo] = useState(false);
  const [openFinanciero, setOpenFinanciero] = useState(false);

  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const engineerUsers = useMemo(() => users.filter((u) => u.role === "engineer" && u.isActive !== false), [users]);

  const clients = useMemo(() => {
    const all = Array.from(new Set([...FIXED_CLIENTS, ...projects.map((p) => p.client)])).sort();
    return ["Todos", ...all];
  }, [projects]);
  const departments = useMemo(() => ["Todos", ...Array.from(new Set(projects.map((p) => p.department))).sort()], [projects]);
  const types = useMemo(() => ["Todos", ...Array.from(new Set(projects.map((p) => p.type)))], [projects]);
  const engineers = useMemo(() => ["Todos", ...engineerUsers.map((u) => u.name)], [engineerUsers]);
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
  const reporteOptions = ["Todos", ...Object.values(REPORTE_DISPLAY)];
  const subOptions = ["Todos", "Sí", "No"];
  const subFacturaOptions = ["Todos", ...Object.values(SUBFACT_DISPLAY)];
  const pagoFinalOptions = ["Todos", ...Object.values(PAGOFINAL_DISPLAY)];
  const sortOptions = ["Reciente ↓", "Antiguo ↑", "Monto ↓", "Monto ↑"];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = projects.filter((p) => {
      if (yearF !== "Todos" && new Date(p.createdAt).getFullYear().toString() !== yearF) return false;
      if (clientF !== "Todos" && p.client !== clientF) return false;
      if (deptF !== "Todos" && p.department !== deptF) return false;
      if (typeF !== "Todos" && p.type !== typeF) return false;
      if (urgencyF !== "Todos") {
        const key = Object.keys(PRIORITY_DISPLAY).find((k) => PRIORITY_DISPLAY[k] === urgencyF);
        if (p.priority !== key) return false;
      }
      if (statusF !== "Todos") {
        const key = Object.keys(STATUS_DISPLAY).find((k) => STATUS_DISPLAY[k] === statusF);
        if (p.status !== key) return false;
      }
      if (engineerF !== "Todos") {
        const assigned = users.find((u) => u.role === "engineer" && (u.id === p.createdBy || (p.participants ?? []).includes(u.id)));
        if (!assigned || assigned.name !== engineerF) return false;
      }
      if (estimF !== "Todos" && p.estimacion !== estimF) return false;
      if (cotizF !== "Todos" && p.cotizacion !== cotizF) return false;
      if (payF !== "Todos") {
        const key = Object.keys(PAYMENT_DISPLAY).find((k) => PAYMENT_DISPLAY[k] === payF);
        if (p.paymentStatus !== key) return false;
      }
      if (fotosF !== "Todos") {
        const key = Object.keys(FOTOS_DISPLAY).find((k) => FOTOS_DISPLAY[k] === fotosF);
        const actual = p.fotosStatus ?? (p.fotos ? "si" : "no");
        if (actual !== key) return false;
      }
      if (reporteF !== "Todos") {
        const key = Object.keys(REPORTE_DISPLAY).find((k) => REPORTE_DISPLAY[k] === reporteF);
        const actual = p.reporteFileStatus ?? "no";
        if (actual !== key) return false;
      }
      if (subF !== "Todos" && !!p.subcontratadoActivo !== (subF === "Sí")) return false;
      if (subFacturaF !== "Todos") {
        if (!p.subcontratadoActivo) return false;
        // Pagado real: se calcula de los archivos de Subcontratados-Facturas, no de un campo
        // aparte — asi el filtro siempre coincide con lo que se ve en la ficha del proyecto.
        const facturasFiles = (p.files ?? []).filter((f) => f.category === "subcontratadosFacturas");
        const allPaid = facturasFiles.length > 0 && facturasFiles.every((f) => f.status === "si");
        const wantPaid = subFacturaF === "Pagado";
        if (allPaid !== wantPaid) return false;
      }
      // MDP y Forma de pago viven por cada pago de Fase 4, no a nivel proyecto — un proyecto
      // puede tener varios pagos con distintos valores, asi que el filtro busca "algun pago
      // que cumpla", igual que ya se hace con Facturas subcont.
      if (mdpF !== "Todos") {
        const pagos = p.pagosProyecto ?? [];
        if (!pagos.some((pg) => (mdpF === "Sin Definir" ? !pg.mdp : pg.mdp === mdpF))) return false;
      }
      if (formaPagoF !== "Todos") {
        const pagos = p.pagosProyecto ?? [];
        if (!pagos.some((pg) => (formaPagoF === "Sin definir" ? !pg.formaPago : pg.formaPago === formaPagoF))) return false;
      }
      if (pagoFinalF !== "Todos") {
        const key = Object.keys(PAGOFINAL_DISPLAY).find((k) => PAGOFINAL_DISPLAY[k] === pagoFinalF);
        if ((p.estatusPagoFinal ?? "Pendiente") !== key) return false;
      }
      // El buscador tambien encuentra por los datos de cada pago (Cliente, Folio Fiscal,
      // Serie, Folio) — asi Administracion puede pegar un folio fiscal y llegar directo
      // al proyecto sin tener que saber en cual esta.
      const pagoTextMatch = (p.pagosProyecto ?? []).some((pg) =>
        [pg.cliente, pg.folioFiscal, pg.serie, pg.folio].some((f) => (f ?? "").toLowerCase().includes(q))
      );
      if (q && !pagoTextMatch && ![p.baseName, p.client, p.structuredName, p.department, p.oc ?? "", p.description].some((f) => f.toLowerCase().includes(q))) return false;
      return true;
    });
    result.sort((a, b) => {
      switch (sortF) {
        case "Antiguo ↑": return a.createdAt.localeCompare(b.createdAt);
        case "Monto ↓": return (b.totalSinIva ?? 0) - (a.totalSinIva ?? 0);
        case "Monto ↑": return (a.totalSinIva ?? 0) - (b.totalSinIva ?? 0);
        default: return b.createdAt.localeCompare(a.createdAt);
      }
    });
    return result;
  }, [projects, query, yearF, clientF, deptF, typeF, urgencyF, statusF, engineerF, estimF, cotizF, payF, fotosF, reporteF, subF, subFacturaF, mdpF, formaPagoF, pagoFinalF, sortF, users]);

  const hasFilters = !!(query || yearF !== "Todos" || clientF !== "Todos" || deptF !== "Todos" || typeF !== "Todos" || urgencyF !== "Todos" || engineerF !== "Todos" || statusF !== "Todos" || estimF !== "Todos" || cotizF !== "Todos" || payF !== "Todos" || fotosF !== "Todos" || reporteF !== "Todos" || subF !== "Todos" || subFacturaF !== "Todos" || mdpF !== "Todos" || formaPagoF !== "Todos" || pagoFinalF !== "Todos");

  const clearFilters = (): void => {
    setQuery(""); setYearF("Todos"); setClientF("Todos"); setDeptF("Todos"); setTypeF("Todos");
    setUrgencyF("Todos"); setEngineerF("Todos"); setStatusF("Todos");
    setEstimF("Todos"); setCotizF("Todos"); setPayF("Todos"); setFotosF("Todos"); setReporteF("Todos"); setSubF("Todos"); setSubFacturaF("Todos");
    setMdpF("Todos"); setFormaPagoF("Todos"); setPagoFinalF("Todos");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-[#3F3F46] bg-[#27272A] p-4 space-y-3">
        {/* Búsqueda + CSV */}
        <div className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Busca un proyecto" className="h-10 flex-1" />
          <button
            type="button"
            onClick={() => exportProjectsCSV(filtered, users)}
            title={`Exportar ${filtered.length} proyecto(s) a CSV`}
            className="inline-flex items-center gap-2 rounded-xl border border-[#3F3F46] bg-[#313136] px-3 py-2 text-xs font-semibold text-[#A1A1AA] transition hover:border-accent/40 hover:bg-[#3F3F46] hover:text-foreground shrink-0"
          >
            <Save className="h-4 w-4" />
            CSV
          </button>
        </div>
        {/* Pills de año */}
        <div className="flex flex-wrap gap-1.5">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYearF(y)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold transition",
                yearF === y
                  ? "bg-accent text-[#111111]"
                  : "bg-[#3F3F46] text-[#A1A1AA] hover:bg-[#52525B] hover:text-foreground",
              )}
            >{y}</button>
          ))}
        </div>
        {/* Operativo (Fase 1/2) — lo que ve tambien el ingeniero dia a dia */}
        <FilterGroupAccordion variant="operativo" icon={Wrench} label="Operativo" open={openOperativo} onToggle={() => setOpenOperativo((o) => !o)}>
          <CompactSelect layout="cell" variant="operativo" label="Cliente" options={clients} value={clientF} onChange={setClientF} />
          <CompactSelect layout="cell" variant="operativo" label="Depto." options={departments} value={deptF} onChange={setDeptF} />
          <CompactSelect layout="cell" variant="operativo" label="Tipo" options={types} value={typeF} onChange={setTypeF} />
          <CompactSelect layout="cell" variant="operativo" label="Urgencia" options={urgencyOptions} value={urgencyF} onChange={setUrgencyF} />
          <CompactSelect layout="cell" variant="operativo" label="Ingeniero" options={engineers} value={engineerF} onChange={setEngineerF} />
          <CompactSelect layout="cell" variant="operativo" label="Estado" options={statusOptions} value={statusF} onChange={setStatusF} />
        </FilterGroupAccordion>
        {/* Administrativo — revisiones de archivo por sección, no dinero */}
        <FilterGroupAccordion variant="administrativo" icon={FileText} label="Administrativo" open={openAdministrativo} onToggle={() => setOpenAdministrativo((o) => !o)}>
          <CompactSelect layout="cell" variant="administrativo" label="Estimación" options={estimOptions} value={estimF} onChange={setEstimF} />
          <CompactSelect layout="cell" variant="administrativo" label="Cotización" options={cotizOptions} value={cotizF} onChange={setCotizF} />
          <CompactSelect layout="cell" variant="administrativo" label="Fotos" options={fotosOptions} value={fotosF} onChange={setFotosF} />
          <CompactSelect layout="cell" variant="administrativo" label="Reporte" options={reporteOptions} value={reporteF} onChange={setReporteF} />
          <CompactSelect layout="cell" variant="administrativo" label="Subcontratados" options={subOptions} value={subF} onChange={setSubF} />
        </FilterGroupAccordion>
        {/* Financiero — dinero: pagos, facturas, MDP */}
        <FilterGroupAccordion variant="finance" icon={DollarSign} label="Financiero" open={openFinanciero} onToggle={() => setOpenFinanciero((o) => !o)}>
          <CompactSelect layout="cell" variant="finance" label="Pago" options={payOptions} value={payF} onChange={setPayF} />
          <CompactSelect layout="cell" variant="finance" label="Facturas subcont." options={subFacturaOptions} value={subFacturaF} onChange={setSubFacturaF} />
          <CompactSelect layout="cell" variant="finance" label="MDP" options={MDP_OPTIONS} value={mdpF} onChange={setMdpF} />
          <CompactSelect layout="cell" variant="finance" label="Forma de pago" options={FORMAPAGO_OPTIONS} value={formaPagoF} onChange={setFormaPagoF} />
          <CompactSelect layout="cell" variant="finance" label="Estatus pago final" options={pagoFinalOptions} value={pagoFinalF} onChange={setPagoFinalF} />
        </FilterGroupAccordion>
        {/* Pie: contador + Ordenar + Limpiar filtros */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-[#888888]">
            Mostrando {filtered.length} de {projects.length} proyecto{projects.length !== 1 ? "s" : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <CompactSelect label="Ordenar" options={sortOptions} value={sortF} onChange={setSortF} />
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

      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} onOpen={onOpenProject}
              showNewBadge={isNewItem(project.createdAt)}
              assignedEngineerName={usersById[project.createdBy]?.name} />
          ))}
        </div>
      ) : (
        <div className="rounded-[28px] border border-dashed border-[#3F3F46] py-14 text-center">
          <p className="text-sm font-semibold text-[#888888]">Ningún proyecto coincide con los filtros</p>
        </div>
      )}
    </div>
  );
}

type FilterGroupVariant = "default" | "operativo" | "administrativo" | "finance";

// Cada grupo lleva un tinte permanente — dorado (Operativo), morado (Administrativo),
// azul (Financiero) — visible este o no seleccionado, para que la agrupación se note de un
// vistazo sin depender del estado activo. "default" ya solo lo usa "Ordenar", que no
// pertenece a ningún grupo. Clases completas y literales (no interpoladas) para que
// Tailwind las detecte al compilar.
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

function CompactSelect({ label, options, value, onChange, variant = "default", layout = "pill" }: { label: string; options: string[]; value: string; onChange: (v: string) => void; variant?: FilterGroupVariant; layout?: "pill" | "cell" }): JSX.Element {
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
          <span className={`max-w-[120px] truncate text-xs font-semibold ${filterValueText(variant, isActive)}`}>{value}</span>
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

// ── UnpaidTab ──────────────────────────────────────────────────────────────────
function UnpaidTab({
  projects, onOpenProject,
}: {
  projects: ProjectItem[];
  onOpenProject: (id: string) => void;
}): JSX.Element {
  const mxn = (v: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v);

  const sorted = useMemo(
    () =>
      [...projects].sort((a, b) => {
        const abal = (a.totalSinIva ?? a.totalContratado) - (a.pagosProyecto ?? []).reduce((s, p) => s + p.monto, 0);
        const bbal = (b.totalSinIva ?? b.totalContratado) - (b.pagosProyecto ?? []).reduce((s, p) => s + p.monto, 0);
        return bbal - abal;
      }),
    [projects],
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-[#3F3F46] py-16 text-center">
        <p className="text-sm font-semibold text-[#888888]">Sin proyectos no pagados</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((project) => {
        const abonoTotal = (project.pagosProyecto ?? []).reduce((s, p) => s + p.monto, 0);
        const base = project.totalSinIva ?? project.totalContratado;
        const porCobrar = base - abonoTotal;
        const isOverdue = project.commitmentDate && parseLocalDate(project.commitmentDate) < new Date();
        return (
          <Card
            key={project.id}
            className="cursor-pointer border-[#3F3F46] bg-[#27272A] transition-all hover:border-white/15 hover:shadow-card-hover"
            onClick={() => onOpenProject(project.id)}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">{project.client} · {project.department}</p>
                <h3 className="mt-1 truncate text-base font-bold text-foreground">{project.baseName}</h3>
                <p className="text-xs text-[#888888]">{project.structuredName}</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#888888]">Contratado</p>
                  <p className="text-sm font-bold text-foreground tabular-nums">{mxn(base)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#888888]">Abonado</p>
                  <p className="text-sm font-bold text-foreground tabular-nums">{mxn(abonoTotal)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-danger">Por cobrar</p>
                  <p className={`text-base font-black tabular-nums ${isOverdue ? "text-danger" : "text-[#F5A524]"}`}>{mxn(porCobrar)}</p>
                  {isOverdue ? <p className="text-[10px] font-bold text-danger">Vencido</p> : null}
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenProject(project.id); }}
                  className="shrink-0 rounded-xl border border-[#3F3F46] px-3 py-1.5 text-xs font-bold text-[#888888] transition hover:border-accent/40 hover:text-accent"
                >
                  Ver F4 →
                </button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── RejectedTab ────────────────────────────────────────────────────────────────
function RejectedTab({
  requests, users, onOpenRequest, onReactivateRequest,
}: {
  requests: RequestItem[];
  users: UserItem[];
  onOpenRequest: (id: string) => void;
  onReactivateRequest?: (id: string) => void;
}): JSX.Element {
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  if (requests.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-[#3F3F46] py-16 text-center">
        <p className="text-sm font-semibold text-[#888888]">Sin solicitudes rechazadas</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => (
        <Card key={req.id} className="border-[#3F3F46] bg-[#27272A]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">{req.client} · {req.department}</p>
              <h3 className="text-base font-bold text-foreground">{req.baseName}</h3>
              <p className="text-xs text-[#888888]">
                Solicitado por: {usersById[req.createdBy]?.name ?? req.createdBy}
              </p>
              {req.rejectionReason ? (
                <div className="mt-2 rounded-xl border border-danger/15 bg-danger/5 px-3 py-2 text-xs text-[#A1A1AA]">
                  <span className="font-bold text-danger">Motivo: </span>{req.rejectionReason}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              {onReactivateRequest ? (
                <button
                  type="button"
                  onClick={() => onReactivateRequest(req.id)}
                  className="rounded-xl border border-[#F5A524]/30 bg-[#F5A524]/10 px-3 py-1.5 text-sm font-bold text-[#F5A524] transition hover:bg-[#F5A524]/20"
                >
                  Reactivar
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onOpenRequest(req.id)}
                className="rounded-xl border border-[#3F3F46] px-3 py-1.5 text-sm font-bold text-[#888888] transition hover:border-white/20 hover:text-white"
              >
                Ver detalle
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── CancelledTab ──────────────────────────────────────────────────────────────
function CancelledTab({
  projects, rejectedRequests, users, onOpenProject, onOpenRequest, onReactivateRequest,
}: {
  projects: ProjectItem[];
  rejectedRequests: RequestItem[];
  users: UserItem[];
  onOpenProject: (id: string) => void;
  onOpenRequest: (id: string) => void;
  onReactivateRequest?: (id: string) => void;
}): JSX.Element {
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  return (
    <div className="space-y-6">
      {/* Proyectos cancelados */}
      {projects.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#888888]">Proyectos cancelados · {projects.length}</p>
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} onOpen={onOpenProject} />
          ))}
        </div>
      ) : null}

      {/* Solicitudes rechazadas */}
      {rejectedRequests.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#888888]">Solicitudes no autorizadas · {rejectedRequests.length}</p>
          {rejectedRequests.map((req) => (
            <Card key={req.id} className="border-[#3F3F46] bg-[#27272A]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3F3F46] px-3 py-1 text-[10px] font-bold text-[#71717A]">
                      Cancelado
                    </span>
                    <span className="text-xs text-[#888888]">{parseLocalDate(req.createdAt).toLocaleDateString("es-MX")}</span>
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">{req.client} · {req.department}</p>
                  <h3 className="text-base font-bold text-foreground">{req.baseName}</h3>
                  <p className="text-xs text-[#888888]">Solicitado por: {usersById[req.createdBy]?.name ?? req.createdBy}</p>
                  {req.rejectionReason ? (
                    <div className="mt-2 rounded-xl border border-[#3F3F46] bg-[#1E1E20] px-3 py-2 text-xs text-[#A1A1AA]">
                      <span className="font-bold text-[#888888]">Motivo: </span>{req.rejectionReason}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  {onReactivateRequest ? (
                    <button
                      type="button"
                      onClick={() => onReactivateRequest(req.id)}
                      className="rounded-xl border border-[#F5A524]/30 bg-[#F5A524]/10 px-3 py-1.5 text-sm font-bold text-[#F5A524] transition hover:bg-[#F5A524]/20"
                    >
                      Reactivar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onOpenRequest(req.id)}
                    className="rounded-xl border border-[#3F3F46] px-3 py-1.5 text-sm font-bold text-[#888888] transition hover:border-white/20 hover:text-white"
                  >
                    Ver detalle
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {projects.length === 0 && rejectedRequests.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-[#3F3F46] py-16 text-center">
          <p className="text-sm font-semibold text-[#888888]">Sin proyectos o solicitudes canceladas</p>
        </div>
      ) : null}
    </div>
  );
}

const roleOptions: Array<{ value: RoleKey; label: string }> = [
  { value: "engineer", label: "Ingeniero" },
  { value: "admin", label: "Administracion" },
  { value: "supervisor", label: "Supervisor" },
  { value: "system_admin", label: "Gestor del sistema" },
];

function UsersAdminPanel({
  users,
  canManageUsers,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
}: {
  users: UserItem[];
  canManageUsers: boolean;
  onCreateUser: AdminViewProps["onCreateUser"];
  onUpdateUser: AdminViewProps["onUpdateUser"];
  onDeleteUser: AdminViewProps["onDeleteUser"];
}): JSX.Element {
  const [draft, setDraft] = useState({ firstName: "", lastName: "", email: "", password: "", department: "", role: "engineer" as RoleKey });
  const [editing, setEditing] = useState<Record<string, Pick<UserItem, "firstName" | "lastName" | "email" | "department" | "role" | "isActive" | "password">>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const handleCreate = (): void => {
    if (!draft.firstName.trim() || !draft.lastName.trim() || !draft.email.trim() || !draft.password.trim()) return;
    onCreateUser({ firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), email: draft.email.trim(), password: draft.password, department: draft.department.trim() || "General", role: draft.role });
    setDraft({ firstName: "", lastName: "", email: "", password: "", department: "", role: "engineer" });
  };
  const editableFor = (user: UserItem) => editing[user.id] ?? { firstName: user.firstName ?? user.name.split(" ")[0] ?? "", lastName: user.lastName ?? user.name.split(" ").slice(1).join(" "), email: user.email, department: user.department, role: user.role, isActive: user.isActive !== false, password: user.password ?? "" };
  const handleSaveRow = (userId: string, value: ReturnType<typeof editableFor>): void => {
    setSavingId(userId);
    onUpdateUser(userId, value)
      .then(() => {
        // Confirmado por el servidor — limpiar el borrador local para que la fila vuelva a
        // reflejar el dato real de `users` (incluye el correo tal cual quedó normalizado).
        setEditing((current) => {
          const next = { ...current };
          delete next[userId];
          return next;
        });
      })
      .catch(() => undefined) // el toast de error ya lo muestra App.tsx
      .finally(() => setSavingId((current) => (current === userId ? null : current)));
  };

  return (
    <div className="space-y-4">
      {!canManageUsers ? <Card className="border-warning/20 bg-warning/10 text-sm font-medium text-[#F5A524]">Solo el rol Gestor del sistema puede crear, editar o eliminar perfiles.</Card> : (
        <Card className="border-accent/15 bg-accent/[0.05]">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-accent"><UserPlus className="h-4 w-4" />Alta de integrante</div>
          <div className="grid gap-3 lg:grid-cols-[0.75fr_0.75fr_1fr_0.8fr_0.8fr_0.8fr_auto]">
            <Input value={draft.firstName} onChange={(event) => setDraft((current) => ({ ...current, firstName: event.target.value }))} placeholder="Nombre" />
            <Input value={draft.lastName} onChange={(event) => setDraft((current) => ({ ...current, lastName: event.target.value }))} placeholder="Apellido" />
            <Input value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Correo" />
            <Input value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} type="password" placeholder="Contrasena" />
            <Input value={draft.department} onChange={(event) => setDraft((current) => ({ ...current, department: event.target.value }))} placeholder="Departamento" />
            <select value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as RoleKey }))} className="h-12 rounded-2xl border border-[#3F3F46] bg-[#313136] px-4 text-sm font-semibold text-foreground outline-none">
              {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            </select>
            <Button onClick={handleCreate} disabled={!draft.firstName.trim() || !draft.lastName.trim() || !draft.email.trim() || !draft.password.trim()}><UserPlus className="h-4 w-4" />Crear</Button>
          </div>
        </Card>
      )}
      <div className="space-y-3">
        {users.map((user) => {
          const value = editableFor(user);
          return (
            <Card key={user.id} className="border-[#3F3F46] bg-[#27272A]">
              <div className="grid gap-3 lg:grid-cols-[0.95fr_0.85fr_1.1fr_0.85fr_0.85fr_0.8fr_auto_auto] lg:items-center">
                <div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-black text-[#111111]">{user.avatar}</div><Input value={value.firstName ?? ""} disabled={!canManageUsers} onChange={(event) => setEditing((current) => ({ ...current, [user.id]: { ...value, firstName: event.target.value } }))} /></div>
                <Input value={value.lastName ?? ""} disabled={!canManageUsers} onChange={(event) => setEditing((current) => ({ ...current, [user.id]: { ...value, lastName: event.target.value } }))} />
                <Input value={value.email} disabled={!canManageUsers} onChange={(event) => setEditing((current) => ({ ...current, [user.id]: { ...value, email: event.target.value } }))} />
                <Input value={value.password ?? ""} disabled={!canManageUsers} type="password" placeholder="Contrasena" onChange={(event) => setEditing((current) => ({ ...current, [user.id]: { ...value, password: event.target.value } }))} />
                <Input value={value.department} disabled={!canManageUsers} onChange={(event) => setEditing((current) => ({ ...current, [user.id]: { ...value, department: event.target.value } }))} />
                <select value={value.role} disabled={!canManageUsers} onChange={(event) => setEditing((current) => ({ ...current, [user.id]: { ...value, role: event.target.value as RoleKey } }))} className="h-12 rounded-2xl border border-[#3F3F46] bg-[#313136] px-4 text-sm font-semibold text-foreground outline-none disabled:opacity-70">
                  {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
                <button type="button" disabled={!canManageUsers} onClick={() => setEditing((current) => ({ ...current, [user.id]: { ...value, isActive: !value.isActive } }))} className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition disabled:opacity-70 ${value.isActive ? "border-success/30 bg-success/10 text-success" : "border-[#3F3F46] bg-[#313136] text-[#888888]"}`}><UsersRound className="h-4 w-4" />{value.isActive ? "Activo" : "Inactivo"}</button>
                <div className="flex gap-2">
                  <Button size="icon" variant="outline" disabled={!canManageUsers || savingId === user.id} onClick={() => handleSaveRow(user.id, value)}>
                    {savingId === user.id ? <RotateCcw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="danger" disabled={!canManageUsers || savingId === user.id} onClick={() => onDeleteUser(user.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ActivityPanel({ activityLogs }: { activityLogs: ActivityLogItem[] }): JSX.Element {
  const actionLabels: Record<string, string> = {
    login: "Inicio de sesion",
    admin_login: "Inicio de sesion gestor",
    created: "Creacion",
    updated: "Actualizacion",
    deleted: "Eliminacion",
    role_updated: "Cambio de rol",
  };

  if (activityLogs.length === 0) {
    return (
      <Card className="border-[#3F3F46] bg-[#27272A] text-sm text-[#A1A1AA]">
        Todavia no hay actividad registrada. Los nuevos movimientos empezaran a aparecer aqui cuando la API actualizada este subida.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {activityLogs.map((item) => (
        <Card key={item.id} className="border-[#3F3F46] bg-[#27272A]">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_0.7fr_0.7fr] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-secondary/15 px-3 py-1 text-xs font-bold text-secondary">
                  {actionLabels[item.action] ?? item.action}
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#888888]">{item.entity_type}</span>
              </div>
              <p className="mt-2 truncate text-base font-semibold text-foreground">{item.entity_name ?? item.entity_id ?? "Sistema"}</p>
              <p className="mt-1 text-sm text-[#888888]">{item.user_name ?? "Sistema"} · {item.user_role ?? "sin rol"}</p>
            </div>
            <div className="text-sm text-[#A1A1AA]">
              <p>{formatCompactDate(item.created_at)}</p>
              <p className="mt-1 truncate text-xs text-[#888888]">{item.ip_address ?? "Sin IP"}</p>
            </div>
            <div className="rounded border border-[#3F3F46] bg-[#1F1F22] p-3 text-xs leading-5 text-[#A1A1AA]">
              {formatActivityDetails(item.details)}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function formatActivityDetails(details?: Record<string, unknown> | null): string {
  if (!details) {
    return "Sin detalle adicional";
  }

  if (typeof details.source === "string") {
    return `Origen: ${details.source}`;
  }

  const before = details.before as Record<string, unknown> | undefined;
  const after = details.after as Record<string, unknown> | undefined;
  if (before || after) {
    const beforeStatus = before?.status ?? before?.paymentStatus ?? before?.name ?? "";
    const afterStatus = after?.status ?? after?.paymentStatus ?? after?.name ?? "";
    return `${beforeStatus || "Antes"} -> ${afterStatus || "Despues"}`;
  }

  return JSON.stringify(details);
}


function getProjectFinancials(project: ProjectItem): {
  spent: number;
  remaining: number;
  billed: number;
  paid: number;
  ratio: number;
  margin: number;
  label: string;
  barClass: string;
  textClass: string;
} {
  const spent = (project.expenses ?? []).reduce((total, expense) => total + expense.monto, 0);
  const billed = project.invoices?.reduce((total, invoice) => total + invoice.subtotal, 0) ?? 0;
  const paid = project.invoices?.reduce((total, invoice) => total + (invoice.status === "pagada" ? invoice.subtotal : 0), 0) ?? 0;
  const remaining = project.totalContratado - spent;
  const ratio = project.totalContratado > 0 ? spent / project.totalContratado : 0;
  const margin = project.totalContratado > 0 ? (remaining / project.totalContratado) * 100 : 0;

  if (ratio >= 1) {
    return { spent, remaining, billed, paid, ratio, margin, label: "Tope de gasto excedido", barClass: "bg-danger", textClass: "text-danger" };
  }

  if (ratio >= 0.75) {
    return { spent, remaining, billed, paid, ratio, margin, label: "Vigilar utilidad", barClass: "bg-[#F5A524]", textClass: "text-[#F5A524]" };
  }

  return { spent, remaining, billed, paid, ratio, margin, label: "Margen disponible estable", barClass: "bg-accent", textClass: "text-accent" };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(value);
}

function formatCompactDate(value: string): string {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(parseLocalDate(value));
}

function getProjectSequence(project: ProjectItem): string {
  const [sequence] = (project.structuredName ?? "").split("-");
  return sequence ? sequence.padStart(4, "0") : "—";
}

// ── CobrosTab ──────────────────────────────────────────────────────────────────

const INVOICE_STATUS_LABELS_MAP: Record<InvoiceStatus, string> = {
  "solicitada": "Solicitada",
  "recibida": "Recibida",
  "en-portal": "En portal",
  "enviada": "Enviada",
  "pagada": "Pagada",
  "cancelada": "Cancelada",
};

const INVOICE_STATUS_COLOR_MAP: Record<InvoiceStatus, string> = {
  "solicitada": "bg-[#F5A524]/15 text-[#F5A524]",
  "recibida": "bg-secondary/15 text-secondary",
  "en-portal": "bg-[#F5A524]/20 text-[#F5A524]",
  "enviada": "bg-accent/15 text-accent",
  "pagada": "bg-[#4ADE80]/15 text-[#4ADE80]",
  "cancelada": "bg-[#3F3F46] text-[#71717A]",
};

function getInvoiceDaysSince(invoice: InvoiceItem): number {
  const ref = invoice.fechaSolicitud || invoice.createdAt;
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000);
}

function CobrosTab({
  projects,
  onOpenProject,
}: {
  projects: ProjectItem[];
  onOpenProject: (id: string) => void;
}): JSX.Element {
  const mxn = (v: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v);

  const withInvoices = useMemo(
    () => projects.filter((p) => (p.invoices?.length ?? 0) > 0),
    [projects],
  );

  const totalFacturado = withInvoices.reduce(
    (sum, p) =>
      sum + (p.invoices ?? []).filter((inv) => inv.status !== "cancelada").reduce((s, inv) => s + inv.subtotal, 0),
    0,
  );
  const totalPagado = withInvoices.reduce(
    (sum, p) =>
      sum + (p.invoices ?? []).filter((inv) => inv.status === "pagada").reduce((s, inv) => s + inv.subtotal, 0),
    0,
  );
  const totalPendiente = totalFacturado - totalPagado;
  const activeInvoicesCount = withInvoices.reduce(
    (sum, p) =>
      sum + (p.invoices ?? []).filter((inv) => inv.status !== "pagada" && inv.status !== "cancelada").length,
    0,
  );

  const sorted = useMemo(() => {
    const maxStuck = (p: ProjectItem): number =>
      Math.max(
        0,
        ...(p.invoices ?? [])
          .filter((i) => i.status !== "pagada" && i.status !== "cancelada")
          .map(getInvoiceDaysSince),
      );
    return [...withInvoices].sort((a, b) => maxStuck(b) - maxStuck(a));
  }, [withInvoices]);

  if (withInvoices.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-[#3F3F46] py-16 text-center">
        <p className="text-sm font-semibold text-[#888888]">Sin facturas registradas</p>
        <p className="mt-2 text-xs text-[#555555]">Las facturas se agregan desde la pestaña F4 de cada proyecto</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total facturado" value={mxn(totalFacturado)} tone="accent" />
        <SummaryCard title="Total cobrado" value={mxn(totalPagado)} tone="secondary" />
        <SummaryCard title="Por cobrar" value={mxn(totalPendiente)} tone={totalPendiente > 0 ? "warning" : "secondary"} />
        <SummaryCard title="Fact. pendientes" value={activeInvoicesCount} tone={activeInvoicesCount > 0 ? "danger" : "secondary"} />
      </div>

      {/* Project / invoice list */}
      <div className="space-y-3">
        {sorted.map((project) => {
          const invs = project.invoices ?? [];
          const activeInvs = invs.filter((inv) => inv.status !== "pagada" && inv.status !== "cancelada");
          const maxStuckDays = activeInvs.length > 0 ? Math.max(...activeInvs.map(getInvoiceDaysSince)) : 0;

          const cardBorder =
            maxStuckDays > 14 ? "border-danger/35" :
            maxStuckDays > 7 ? "border-[#F5A524]/35" :
            activeInvs.length === 0 ? "border-[#4ADE80]/15" :
            "border-[#3F3F46]";

          const cardBg =
            maxStuckDays > 14 ? "bg-danger/[0.04]" :
            maxStuckDays > 7 ? "bg-[#F5A524]/[0.04]" :
            "bg-[#27272A]";

          return (
            <Card key={project.id} className={`${cardBorder} ${cardBg}`}>
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-accent px-2.5 py-0.5 text-[10px] font-black text-[#111111]">
                        #{getProjectSequence(project)}
                      </span>
                      {maxStuckDays > 14 ? (
                        <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-[10px] font-bold text-danger">
                          ⚠ {maxStuckDays}d estancada
                        </span>
                      ) : maxStuckDays > 7 ? (
                        <span className="rounded-full bg-[#F5A524]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#F5A524]">
                          {maxStuckDays}d sin avanzar
                        </span>
                      ) : null}
                      {activeInvs.length === 0 && invs.length > 0 ? (
                        <span className="rounded-full bg-[#4ADE80]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#4ADE80]">
                          ✓ Todo cobrado
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground">{project.baseName}</p>
                    <p className="text-xs text-[#888888]">{project.client} · {project.department}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenProject(project.id)}
                    className="shrink-0 rounded-xl border border-[#3F3F46] px-3 py-1.5 text-xs font-bold text-[#888888] transition hover:border-accent/40 hover:text-accent"
                  >
                    Ver →
                  </button>
                </div>

                {/* Invoice rows */}
                <div className="space-y-1.5">
                  {invs.map((inv) => {
                    const days = getInvoiceDaysSince(inv);
                    const isActive = inv.status !== "pagada" && inv.status !== "cancelada";
                    return (
                      <div
                        key={inv.id}
                        className="flex flex-wrap items-center gap-2 rounded-xl bg-[#1E1E20] px-3 py-2 text-xs"
                      >
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${INVOICE_STATUS_COLOR_MAP[inv.status] ?? "bg-[#3F3F46] text-[#888888]"}`}>
                          {INVOICE_STATUS_LABELS_MAP[inv.status] ?? inv.status}
                        </span>
                        {inv.oc ? <span className="font-semibold text-foreground">OC {inv.oc}</span> : null}
                        <span className="font-bold text-foreground tabular-nums">{mxn(inv.subtotal)}</span>
                        {inv.facturarA ? <span className="text-[#888888]">→ {inv.facturarA}</span> : null}
                        {inv.mdp ? (
                          <span className="rounded bg-[#3F3F46] px-1.5 py-0.5 font-mono text-[9px] text-[#888888]">
                            {inv.mdp}
                          </span>
                        ) : null}
                        {inv.fechaSolicitud ? (
                          <span className="text-[10px] text-[#52525B]">
                            {parseLocalDate(inv.fechaSolicitud).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                          </span>
                        ) : null}
                        {inv.fechaPago ? (
                          <span className="ml-auto text-[10px] font-semibold text-[#4ADE80]">
                            Pago: {parseLocalDate(inv.fechaPago).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                          </span>
                        ) : isActive && days > 0 ? (
                          <span className={`ml-auto text-[10px] font-bold tabular-nums ${days > 14 ? "text-danger" : days > 7 ? "text-[#F5A524]" : "text-[#555555]"}`}>
                            {days}d
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
