import { AlertTriangle, BadgeDollarSign, Eye, FolderOpenDot, MoreVertical, Plus, Save, ShieldAlert, Trash2, UserPlus, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { isNewItem } from "@/lib/utils";
import { SectionTitle } from "@/components/layout/section-title";
import { Tabs } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { AdminReviewCard } from "@/components/cards/admin-review-card";
import { ProjectCard } from "@/components/cards/project-card";
import { RequestCard } from "@/components/cards/request-card";
import { ProjectCalendar } from "@/components/common/project-calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PriorityBadge } from "@/components/common/priority-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { ActivityLogItem, PROJECT_TYPE_LABELS, TIPO_PAGO_LABELS, ProjectItem, ProjectStatus, ProjectType, RequestItem, RequestStatus, RoleKey, TipoPago, UserItem } from "@/types";

type AdminTab =
  | "review"
  | "active"
  | "completed"
  | "cancelled"
  | "unpaid"
  | "rejected"
  | "correction"
  | "calendar"
  | "users"
  | "projects"
  | "requests"
  | "activity";

interface AdminViewProps {
  tab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  activeUserName: string;
  reviewRequests: RequestItem[];
  activeProjects: ProjectItem[];
  completedProjects: ProjectItem[];
  cancelledProjects: ProjectItem[];
  unpaidProjects: ProjectItem[];
  rejectedRequests: RequestItem[];
  correctionRequests: RequestItem[];
  projects: ProjectItem[];
  requests: RequestItem[];
  users: UserItem[];
  activityLogs: ActivityLogItem[];
  canManageUsers: boolean;
  onCreateProject: (payload: {
    sequence: string;
    baseName: string;
    client: string;
    department: string;
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
  onUpdateUser: (userId: string, payload: Pick<UserItem, "firstName" | "lastName" | "email" | "department" | "role" | "isActive" | "password">) => void;
  onDeleteUser: (userId: string) => void;
  onOpenRequest: (requestId: string) => void;
  onOpenProject: (projectId: string) => void;
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
  onCreateProject,
  onDeleteProject,
  onCreateRequest,
  onDeleteRequest,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  onOpenProject,
  onOpenRequest,
}: AdminViewProps): JSX.Element {
  const systemTab = tab === "requests" || tab === "users" || tab === "projects" || tab === "activity" ? tab : "projects";
  const financial = useMemo(() => {
    const totalContratado = projects.reduce((total, project) => total + project.totalContratado, 0);
    const totalGastos = projects.reduce((total, project) => total + getProjectFinancials(project).spent, 0);
    const totalPagado = projects.reduce((total, project) => total + getProjectFinancials(project).paid, 0);

    return {
      totalContratado,
      totalGastos,
      utilidad: totalContratado - totalGastos,
      totalPagado,
    };
  }, [projects]);

  return (
    <section className="space-y-6">
      <SectionTitle eyebrow={`Gestor del sistema: ${activeUserName}`} title="Gestion general del sistema" />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard title="Proyectos" value={projects.length} tone="accent" />
        <SummaryCard title="Solicitudes" value={requests.length} tone="warning" />
        <SummaryCard title="Usuarios" value={users.length} tone="secondary" />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <SummaryCard title="Contratado" value={formatCurrency(financial.totalContratado)} tone="accent" />
        <SummaryCard title="Gastos" value={formatCurrency(financial.totalGastos)} tone="warning" />
        <SummaryCard title="Utilidad estimada" value={formatCurrency(financial.utilidad)} tone={financial.utilidad < 0 ? "danger" : "secondary"} />
        <SummaryCard title="Pagado" value={formatCurrency(financial.totalPagado)} tone="secondary" />
      </div>

      <Tabs
        value={systemTab}
        onValueChange={onTabChange}
        options={[
          { key: "projects", label: "Proyectos", count: projects.length },
          { key: "requests", label: "Solicitudes", count: requests.length },
          { key: "users", label: "Usuarios", count: users.length },
          { key: "activity", label: "Actividad", count: activityLogs.length },
        ]}
      />

      {systemTab === "projects" ? (
        <ProjectsManager
          projects={projects}
          users={users}
          onCreateProject={onCreateProject}
          onDeleteProject={onDeleteProject}
          onOpenProject={onOpenProject}
        />
      ) : null}

      {systemTab === "requests" ? (
        <RequestsManager
          requests={requests}
          users={users}
          onCreateRequest={onCreateRequest}
          onDeleteRequest={onDeleteRequest}
          onOpenRequest={onOpenRequest}
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
  users,
  onCreateProject,
  onDeleteProject,
  onOpenProject,
}: {
  projects: ProjectItem[];
  users: UserItem[];
  onCreateProject: AdminViewProps["onCreateProject"];
  onDeleteProject: AdminViewProps["onDeleteProject"];
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
    type: "INST" as ProjectType,
    description: "",
    status: "en-programacion" as ProjectStatus,
    paymentStatus: "unpaid" as ProjectItem["paymentStatus"],
    tipoPago: "concurso" as TipoPago,
    priority: "medium" as ProjectItem["priority"],
    totalContratado: "",
    assignedEngineerId: "",
  });

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
      description: draft.description.trim(),
      totalContratado: Number(draft.totalContratado) || 0,
      assignedEngineerId: draft.assignedEngineerId || undefined,
    });
    setDraft((current) => ({ ...current, sequence: "", baseName: "", description: "", totalContratado: "", assignedEngineerId: "" }));
  };

  return (
    <div className="space-y-4">
      <Card className="border-accent/15 bg-accent/[0.05]">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-accent">
          <Plus className="h-4 w-4" />
          Alta manual de proyecto
        </div>
        <div className="grid gap-3 lg:grid-cols-[0.45fr_1fr_0.7fr_0.7fr_0.6fr]">
          <Input value={draft.sequence} onChange={(event) => setDraft((c) => ({ ...c, sequence: event.target.value.replace(/\D/g, "") }))} placeholder="Consecutivo" />
          <Input value={draft.baseName} onChange={(event) => setDraft((c) => ({ ...c, baseName: event.target.value }))} placeholder="Nombre del proyecto" />
          <Input value={draft.client} onChange={(event) => setDraft((c) => ({ ...c, client: event.target.value }))} placeholder="Cliente" />
          <Input value={draft.department} onChange={(event) => setDraft((c) => ({ ...c, department: event.target.value }))} placeholder="Departamento" />
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

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setDirection((current) => (current === "asc" ? "desc" : "asc"))}>
          Orden {direction === "asc" ? "ascendente" : "descendente"}
        </Button>
      </div>

      <div className="space-y-3">
        {sortedProjects.map((project) => {
          const finance = getProjectFinancials(project);
          const assignedEngineer = users.find(
            (user) => user.role === "engineer" && (user.id === project.createdBy || project.participants.includes(user.id)),
          );

          return (
          <Card key={project.id} className="border-[#3F3F46] bg-[#27272A]">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.9fr)_auto] xl:items-center">
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
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                  <Metric label="Contratado" value={formatCurrency(project.totalContratado)} />
                  <Metric label="Gastos" value={formatCurrency(finance.spent)} />
                  <Metric label="Disponible" value={formatCurrency(finance.remaining)} />
                  <Metric label="Utilidad" value={`${finance.margin.toFixed(1)}%`} />
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-[#A1A1AA]">
                    <span>Ejecucion de costos</span>
                    <span>{Math.round(finance.ratio * 100)}%</span>
                  </div>
                  <div className="h-2 rounded bg-[#3F3F46]">
                    <div className={`h-full rounded ${finance.barClass}`} style={{ width: `${Math.min(finance.ratio * 100, 100)}%` }} />
                  </div>
                  <p className={`mt-1 text-xs font-semibold ${finance.textClass}`}>{finance.label}</p>
                </div>
                <div className="grid gap-2 text-xs text-[#A1A1AA] sm:grid-cols-3">
                  <span>Facturado: {formatCurrency(finance.billed)}</span>
                  <span>Pagado: {formatCurrency(finance.paid)}</span>
                  <span>OC: {project.oc ?? "N/A"}</span>
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
                        Eliminar
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
    </div>
  );
}

function RequestsManager({
  requests,
  users,
  onCreateRequest,
  onDeleteRequest,
  onOpenRequest,
}: {
  requests: RequestItem[];
  users: UserItem[];
  onCreateRequest: AdminViewProps["onCreateRequest"];
  onDeleteRequest: AdminViewProps["onDeleteRequest"];
  onOpenRequest: AdminViewProps["onOpenRequest"];
}): JSX.Element {
  const [openMenuReqId, setOpenMenuReqId] = useState<string | null>(null);
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

      <div className="space-y-3">
        {requests.map((request) => (
          <Card key={request.id} className="border-[#3F3F46] bg-[#27272A]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind="request" value={request.status} />
                  <span className="text-xs font-semibold text-[#888888]">{new Date(request.createdAt).toLocaleDateString("es-MX")}</span>
                </div>
                <p className="mt-2 text-base font-semibold text-foreground">{request.baseName}</p>
                <p className="mt-1 text-sm text-[#888888]">{request.client} · {request.department} · {request.structuredName}</p>
                <div className="mt-3 grid gap-2 text-xs text-[#A1A1AA] sm:grid-cols-2 lg:grid-cols-4">
                  <span>Solicitó: {users.find((user) => user.id === request.createdBy)?.name ?? request.createdBy}</span>
                  <span>Tipo: {request.type}</span>
                  <span>Vínculo: {request.linkedProjectId ? "Proyecto aprobado" : request.duplicateOfProjectId ? "Posible duplicado" : "Sin vínculo"}</span>
                  <span className="truncate">Descripción: {request.description}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
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
  unpaidProjects,
  rejectedRequests,
  correctionRequests,
  projects,
  users,
  canManageUsers,
  onCreateProject,
  onDeleteProject,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  onOpenRequest,
  onOpenProject,
}: AdminViewProps): JSX.Element {
  const summaryCards = [
    { title: "Por revisar", value: reviewRequests.length, icon: ShieldAlert, bg: "bg-[#27272A]", border: "border-[#F5A524]/20", iconBg: "bg-[#F5A524]/15 text-[#F5A524]", labelColor: "text-[#F5A524]", accent: "bg-warning" },
    { title: "Proyectos activos", value: activeProjects.length, icon: FolderOpenDot, bg: "bg-[#27272A]", border: "border-secondary/20", iconBg: "bg-secondary/15 text-secondary", labelColor: "text-secondary", accent: "bg-secondary" },
    { title: "No pagados", value: unpaidProjects.length, icon: BadgeDollarSign, bg: "bg-[#27272A]", border: "border-danger/20", iconBg: "bg-danger/15 text-danger", labelColor: "text-danger", accent: "bg-danger" },
    { title: "Rechazadas", value: rejectedRequests.length, icon: AlertTriangle, bg: "bg-[#27272A]", border: "border-[#3F3F46]", iconBg: "bg-[#3F3F46] text-[#888888]", labelColor: "text-[#888888]", accent: "bg-[#52525B]" },
  ];
  const calendarProjects = [...activeProjects, ...completedProjects, ...cancelledProjects];
  const calendarCount = calendarProjects.reduce((total, project) => total + (project.commitmentDate ? 1 : 0) + (project.importantDates?.length ?? 0), 0);

  return (
    <section className="space-y-6">
      <SectionTitle eyebrow={`Espacio de trabajo de ${activeUserName}`} title="Centro de revision administrativa" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.title} className={`relative overflow-hidden border ${card.bg} ${card.border}`}>
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
          { key: "review", label: "Solicitudes por revisar", count: reviewRequests.length },
          { key: "active", label: "Proyectos activos", count: activeProjects.length },
          { key: "completed", label: "Terminados", count: completedProjects.length },
          { key: "cancelled", label: "Cancelados", count: cancelledProjects.length },
          { key: "unpaid", label: "No pagados", count: unpaidProjects.length },
          { key: "rejected", label: "Rechazadas", count: rejectedRequests.length },
          { key: "correction", label: "En correccion", count: correctionRequests.length },
          { key: "calendar", label: "Calendario", count: calendarCount },
          { key: "users", label: "Usuarios", count: users.length },
          { key: "projects", label: "Nuevo proyecto" },
        ]}
      />
      {tab === "review" ? <div className="card-grid">{reviewRequests.map((request) => <AdminReviewCard key={request.id} request={request} onOpen={onOpenRequest} />)}</div> : null}
      {tab === "active" ? <div className="space-y-3">{activeProjects.map((project) => <ProjectCard key={project.id} project={project} onOpen={onOpenProject} showNewBadge={isNewItem(project.createdAt)} />)}</div> : null}
      {tab === "completed" ? <div className="space-y-3">{completedProjects.map((project) => <ProjectCard key={project.id} project={project} onOpen={onOpenProject} showNewBadge={isNewItem(project.createdAt)} />)}</div> : null}
      {tab === "cancelled" ? <div className="space-y-3">{cancelledProjects.map((project) => <ProjectCard key={project.id} project={project} onOpen={onOpenProject} showNewBadge={isNewItem(project.createdAt)} />)}</div> : null}
      {tab === "unpaid" ? <div className="space-y-3">{unpaidProjects.map((project) => <ProjectCard key={project.id} project={project} onOpen={onOpenProject} showNewBadge={isNewItem(project.createdAt)} />)}</div> : null}
      {tab === "rejected" ? <div className="card-grid">{rejectedRequests.map((request) => <RequestCard key={request.id} request={request} onOpen={onOpenRequest} />)}</div> : null}
      {tab === "correction" ? <div className="card-grid">{correctionRequests.map((request) => <RequestCard key={request.id} request={request} onOpen={onOpenRequest} />)}</div> : null}
      {tab === "calendar" ? <ProjectCalendar projects={calendarProjects} onOpenProject={onOpenProject} showSideList /> : null}
      {tab === "users" ? <UsersAdminPanel users={users} canManageUsers={canManageUsers} onCreateUser={onCreateUser} onUpdateUser={onUpdateUser} onDeleteUser={onDeleteUser} /> : null}
      {tab === "projects" ? <ProjectsManager projects={projects} users={users} onCreateProject={onCreateProject} onDeleteProject={onDeleteProject} onOpenProject={onOpenProject} /> : null}
    </section>
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
  const handleCreate = (): void => {
    if (!draft.firstName.trim() || !draft.lastName.trim() || !draft.email.trim() || !draft.password.trim()) return;
    onCreateUser({ firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), email: draft.email.trim(), password: draft.password, department: draft.department.trim() || "General", role: draft.role });
    setDraft({ firstName: "", lastName: "", email: "", password: "", department: "", role: "engineer" });
  };
  const editableFor = (user: UserItem) => editing[user.id] ?? { firstName: user.firstName ?? user.name.split(" ")[0] ?? "", lastName: user.lastName ?? user.name.split(" ").slice(1).join(" "), email: user.email, department: user.department, role: user.role, isActive: user.isActive !== false, password: user.password ?? "" };

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
                <div className="flex gap-2"><Button size="icon" variant="outline" disabled={!canManageUsers} onClick={() => onUpdateUser(user.id, value)}><Save className="h-4 w-4" /></Button><Button size="icon" variant="danger" disabled={!canManageUsers} onClick={() => onDeleteUser(user.id)}><Trash2 className="h-4 w-4" /></Button></div>
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

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded border border-[#3F3F46] bg-[#1F1F22] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#888888]">{label}</p>
      <p className="mt-1 truncate text-sm font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
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
  const spent = project.expenses.reduce((total, expense) => total + expense.monto, 0);
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
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function getProjectSequence(project: ProjectItem): string {
  const [sequence] = project.structuredName.split("-");
  return sequence.padStart(4, "0");
}
