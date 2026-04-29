import {
  AlertCircle, CalendarDays, Camera, CheckCircle2, Download, Edit3, Eye,
  FileUp, Images, MessageCircleMore, MoreVertical, Plus, Receipt, Save, Trash2, XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import {
  CotizacionStatus, EstimacionStatus, InvoiceItem, InvoiceStatus, MDP,
  PaymentStatus, PriorityLevel, ProjectExpenseItem, ProjectItem, ProjectStatus,
  TIPO_PAGO_LABELS, TipoPago, UserItem,
} from "@/types";
import { FieldDisplay } from "@/components/common/field-display";
import { StatusBadge } from "@/components/common/status-badge";
import { PriorityBadge } from "@/components/common/priority-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatOptionalDate } from "@/lib/utils";
import { GastosProyecto } from "@/components/gastos/GastosProyecto";

type ProjectDialogTab = "info" | "files" | "gastos" | "chat" | "history" | "calendar" | "facturas";

const SELECT_CLASS = "h-11 w-full rounded-xl border border-white/[0.07] bg-[#1F1F22] px-3 text-sm font-semibold text-foreground outline-none transition focus:border-accent/45 focus:ring-4 focus:ring-accent/10";
const ADMIN_FIELD_CLASS = "space-y-1.5";
const ADMIN_LABEL_CLASS = "text-[10px] font-bold uppercase tracking-[0.14em] text-[#888888]";

const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  solicitada: "Solicitada a Mere",
  recibida: "Recibida",
  "en-portal": "En portal",
  enviada: "Factura enviada",
  pagada: "Pagada",
  cancelada: "Cancelada",
};

const ESTIMACION_OPTIONS: EstimacionStatus[] = ["Pendiente", "Realizada", "Cancelada", "Comparativa", "N/A", "Sin información"];
const COTIZACION_OPTIONS: CotizacionStatus[] = ["Pendiente", "Realizada", "Enviada", "Revisión", "Cancelada", "Comparativa", "N/A", "Sin información"];

const STATUS_STRIPE: Record<ProjectStatus, string> = {
  "en-concurso": "bg-blue-400",
  "en-programacion": "bg-[#F5A524]",
  "in-progress": "bg-accent",
  "pendiente-aprobacion": "bg-orange-400",
  "pendiente-autorizar": "bg-orange-500",
  reasignado: "bg-purple-400",
  "cierre-por-sistema": "bg-[#71717A]",
  comparativa: "bg-indigo-400",
  "no-autorizado": "bg-danger",
  completed: "bg-emerald-500",
  cancelled: "bg-[#52525B]",
};

const INVOICE_STRIPE: Record<InvoiceStatus, string> = {
  solicitada: "bg-[#F5A524]",
  recibida: "bg-blue-400",
  "en-portal": "bg-[#F5A524]",
  enviada: "bg-secondary",
  pagada: "bg-accent",
  cancelada: "bg-[#52525B]",
};

const INVOICE_STEP_KEYS: InvoiceStatus[] = ["solicitada", "recibida", "en-portal", "enviada", "pagada"];

function InvoiceProgressSteps({ status }: { status: InvoiceStatus }): JSX.Element {
  if (status === "cancelada") {
    return (
      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#888888]">
        <XCircle className="h-3.5 w-3.5" />
        Cancelada
      </div>
    );
  }
  const currentIdx = INVOICE_STEP_KEYS.indexOf(status);
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {INVOICE_STEP_KEYS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step} className="flex items-center">
            {done ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" />
            ) : (
              <div className={`h-2.5 w-2.5 shrink-0 rounded-full transition-all duration-300 ${active ? "bg-accent ring-2 ring-accent/40 ring-offset-1 ring-offset-[#27272A]" : "bg-[#3F3F46]"}`} />
            )}
            {i < INVOICE_STEP_KEYS.length - 1 ? (
              <div className={`mx-1 h-px w-4 shrink-0 transition-colors duration-300 ${done ? "bg-accent/40" : "bg-[#3F3F46]"}`} />
            ) : null}
          </div>
        );
      })}
      <span className={`ml-2 text-[11px] font-semibold ${currentIdx === INVOICE_STEP_KEYS.length - 1 ? "text-accent" : "text-[#A1A1AA]"}`}>
        {INVOICE_STATUS_LABELS[status]}
      </span>
    </div>
  );
}

interface ProjectDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectItem;
  users: UserItem[];
  onSaveProject: (projectId: string, payload: Pick<ProjectItem, "description" | "summary">) => void;
  onAdminUpdateProject: (
    projectId: string,
    payload: {
      status: ProjectStatus;
      paymentStatus: PaymentStatus;
      tipoPago?: TipoPago;
      priority: PriorityLevel;
      commitmentDate?: string;
      startDate?: string;
      endDate?: string;
      estimacion?: EstimacionStatus;
      cotizacion?: CotizacionStatus;
      oc?: string;
      facturarA?: string;
      negociador?: string;
      usuarioContacto?: string;
      totalSinIva?: number;
      assignedEngineerId?: string;
    },
  ) => void;
  onAddComment: (projectId: string, message: string, isPriority: boolean, authorId: string) => void;
  onAddProjectImportantDate: (projectId: string, payload: { title: string; date: string; description?: string }) => void;
  onAddExpense: (projectId: string, expense: Omit<ProjectExpenseItem, "id" | "createdAt" | "creadoPor">) => void;
  onDeleteExpense: (projectId: string, expenseId: string) => void;
  onUpdateBudget: (projectId: string, amount: number) => void;
  onAddInvoice?: (projectId: string, invoice: Omit<InvoiceItem, "id" | "createdAt" | "createdBy">) => void;
  onUpdateInvoice?: (projectId: string, invoiceId: string, updates: Partial<InvoiceItem>) => void;
  currentUser: UserItem;
  canEditProject: boolean;
  canManageProjectStatus: boolean;
  canManageProjectCalendar: boolean;
  canAddExpense: boolean;
  canDeleteExpense: boolean;
  canEditBudget: boolean;
  canDeleteProject: boolean;
  canManageInvoices?: boolean;
  onUploadFile?: (projectId: string, file: File) => Promise<void>;
  onDeleteProject: (projectId: string) => void;
}

const emptyInvoiceDraft = () => ({
  fechaSolicitud: new Date().toISOString().slice(0, 10),
  factura: "",
  oc: "",
  subtotal: "",
  facturarA: "",
  promesaPago: "",
  mdp: "PPD" as MDP,
  complementoPago: "",
  abonoAntesIva: "",
});

export function ProjectDetailDialog({
  open,
  onOpenChange,
  project,
  users,
  onSaveProject,
  onAdminUpdateProject,
  onAddComment,
  onAddProjectImportantDate,
  onAddExpense,
  onDeleteExpense,
  onUpdateBudget,
  onAddInvoice,
  onUpdateInvoice,
  currentUser,
  canEditProject,
  canManageProjectStatus,
  canManageProjectCalendar,
  canAddExpense,
  canDeleteExpense,
  canEditBudget,
  canDeleteProject,
  canManageInvoices = false,
  onUploadFile,
  onDeleteProject,
}: ProjectDetailDialogProps): JSX.Element | null {
  const [tab, setTab] = useState<ProjectDialogTab>("info");
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [summary, setSummary] = useState(project?.summary ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [adminStatus, setAdminStatus] = useState<ProjectStatus>(project?.status ?? "en-programacion");
  const [adminPaymentStatus, setAdminPaymentStatus] = useState<PaymentStatus>(project?.paymentStatus ?? "unpaid");
  const [adminTipoPago, setAdminTipoPago] = useState<TipoPago | "">(project?.tipoPago ?? "");
  const [adminPriority, setAdminPriority] = useState<PriorityLevel>(project?.priority ?? "medium");
  const [adminCommitmentDate, setAdminCommitmentDate] = useState(project?.commitmentDate ?? "");
  const [adminStartDate, setAdminStartDate] = useState(project?.startDate ?? "");
  const [adminEndDate, setAdminEndDate] = useState(project?.endDate ?? "");
  const [adminEstimacion, setAdminEstimacion] = useState<EstimacionStatus | "">(project?.estimacion ?? "");
  const [adminCotizacion, setAdminCotizacion] = useState<CotizacionStatus | "">(project?.cotizacion ?? "");
  const [adminOc, setAdminOc] = useState(project?.oc ?? "");
  const [adminFacturarA, setAdminFacturarA] = useState(project?.facturarA ?? "");
  const [adminNegociador, setAdminNegociador] = useState(project?.negociador ?? "");
  const [adminUsuarioContacto, setAdminUsuarioContacto] = useState(project?.usuarioContacto ?? "");
  const [adminTotalSinIva, setAdminTotalSinIva] = useState(project?.totalSinIva?.toString() ?? "");
  const [adminAssignedEngineerId, setAdminAssignedEngineerId] = useState("");
  const [importantDateTitle, setImportantDateTitle] = useState("");
  const [importantDateValue, setImportantDateValue] = useState("");
  const [message, setMessage] = useState("");
  const [isPriority, setIsPriority] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState(emptyInvoiceDraft());
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const usersById = useMemo(
    () => Object.fromEntries(users.map((user) => [user.id, user])),
    [users],
  );
  const engineerUsers = useMemo(() => users.filter((user) => user.role === "engineer" && user.isActive !== false), [users]);
  const assignedEngineer = useMemo(() => {
    if (!project) return undefined;
    return engineerUsers.find((user) => user.id === project.createdBy || project.participants.includes(user.id));
  }, [engineerUsers, project]);

  useEffect(() => {
    if (!project) return;
    setTab("info");
    setIsEditing(false);
    setShowDeleteMenu(false);
    setSummary(project.summary);
    setDescription(project.description);
    setAdminStatus(project.status);
    setAdminPaymentStatus(project.paymentStatus);
    setAdminTipoPago(project.tipoPago ?? "");
    setAdminPriority(project.priority);
    setAdminCommitmentDate(project.commitmentDate ?? "");
    setAdminStartDate(project.startDate ?? "");
    setAdminEndDate(project.endDate ?? "");
    setAdminEstimacion(project.estimacion ?? "");
    setAdminCotizacion(project.cotizacion ?? "");
    setAdminOc(project.oc ?? "");
    setAdminFacturarA(project.facturarA ?? "");
    setAdminNegociador(project.negociador ?? "");
    setAdminUsuarioContacto(project.usuarioContacto ?? "");
    setAdminTotalSinIva(project.totalSinIva?.toString() ?? "");
    setAdminAssignedEngineerId(
      users.find((user) => user.role === "engineer" && (user.id === project.createdBy || project.participants.includes(user.id)))?.id ?? "",
    );
    setImportantDateTitle("");
    setImportantDateValue("");
    setMessage("");
    setIsPriority(false);
    setInvoiceDraft(emptyInvoiceDraft());
    setShowInvoiceForm(false);
    setLightboxUrl(null);
  }, [project?.id]);

  if (!project) return null;

  const resetLocalState = (): void => {
    setTab("info");
    setIsEditing(false);
    setShowDeleteMenu(false);
    setSummary(project.summary);
    setDescription(project.description);
    setAdminStatus(project.status);
    setAdminPaymentStatus(project.paymentStatus);
    setAdminTipoPago(project.tipoPago ?? "");
    setAdminPriority(project.priority);
    setAdminCommitmentDate(project.commitmentDate ?? "");
    setAdminStartDate(project.startDate ?? "");
    setAdminEndDate(project.endDate ?? "");
    setAdminEstimacion(project.estimacion ?? "");
    setAdminCotizacion(project.cotizacion ?? "");
    setAdminOc(project.oc ?? "");
    setAdminFacturarA(project.facturarA ?? "");
    setAdminNegociador(project.negociador ?? "");
    setAdminUsuarioContacto(project.usuarioContacto ?? "");
    setAdminTotalSinIva(project.totalSinIva?.toString() ?? "");
    setAdminAssignedEngineerId(assignedEngineer?.id ?? "");
    setImportantDateTitle("");
    setImportantDateValue("");
    setMessage("");
    setIsPriority(false);
    setInvoiceDraft(emptyInvoiceDraft());
    setShowInvoiceForm(false);
    setLightboxUrl(null);
  };

  const handleSave = (): void => {
    onSaveProject(project.id, { description, summary });
    setIsEditing(false);
  };

  const handleAdminStatusSave = (): void => {
    onAdminUpdateProject(project.id, {
      status: adminStatus,
      paymentStatus: adminPaymentStatus,
      tipoPago: adminTipoPago || undefined,
      priority: adminPriority,
      commitmentDate: adminCommitmentDate || undefined,
      startDate: adminStartDate || undefined,
      endDate: adminEndDate || undefined,
      estimacion: adminEstimacion || undefined,
      cotizacion: adminCotizacion || undefined,
      oc: adminOc || undefined,
      facturarA: adminFacturarA || undefined,
      negociador: adminNegociador || undefined,
      usuarioContacto: adminUsuarioContacto || undefined,
      totalSinIva: adminTotalSinIva ? Number(adminTotalSinIva) : undefined,
      assignedEngineerId: adminAssignedEngineerId || undefined,
    });
  };

  const handleAddImportantDate = (): void => {
    if (!importantDateTitle.trim() || !importantDateValue) return;
    onAddProjectImportantDate(project.id, { title: importantDateTitle.trim(), date: importantDateValue });
    setImportantDateTitle("");
    setImportantDateValue("");
  };

  const handleAddInvoice = (): void => {
    if (!onAddInvoice) return;
    if (!invoiceDraft.oc.trim() || !invoiceDraft.subtotal || !invoiceDraft.facturarA.trim()) return;
    const complementoPago = invoiceDraft.mdp === "PUE" ? "N/A" : invoiceDraft.complementoPago;
    onAddInvoice(project.id, {
      fechaSolicitud: invoiceDraft.fechaSolicitud,
      factura: invoiceDraft.factura || undefined,
      oc: invoiceDraft.oc.trim(),
      subtotal: Number(invoiceDraft.subtotal),
      facturarA: invoiceDraft.facturarA.trim(),
      promesaPago: invoiceDraft.promesaPago || undefined,
      status: "solicitada",
      mdp: invoiceDraft.mdp,
      complementoPago,
      abonoAntesIva: invoiceDraft.abonoAntesIva ? Number(invoiceDraft.abonoAntesIva) : undefined,
    });
    setInvoiceDraft(emptyInvoiceDraft());
    setShowInvoiceForm(false);
  };

  const mxn = (value?: number) =>
    value !== undefined
      ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(value)
      : "—";

  const invoices = project.invoices ?? [];
  const invoiceCount = invoices.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) resetLocalState();
        onOpenChange(nextOpen);
      }}
      title={project.baseName}
      description={project.structuredName}
      className="max-w-6xl"
    >
      <Tabs
        value={tab}
        onValueChange={setTab}
        options={[
          { key: "info", label: "Info" },
          { key: "facturas", label: "Facturación", count: invoiceCount },
          { key: "files", label: "Archivos", count: project.files.length },
          { key: "gastos", label: "Costos", count: project.expenses.length },
          { key: "calendar", label: "Calendario", count: (project.commitmentDate ? 1 : 0) + (project.importantDates?.length ?? 0) },
          { key: "chat", label: "Chat", count: project.comments.length },
          { key: "history", label: "Historial", count: project.history.length },
        ]}
      />

      {/* ── TAB INFO ── */}
      {tab === "info" ? (
        <div className="mt-5 space-y-5">

          {/* Header con franja de status */}
          <div className="relative overflow-hidden rounded-[26px] bg-[#313136]/50 p-5">
            <div className={`absolute left-0 top-0 h-full w-1.5 rounded-l-[26px] ${STATUS_STRIPE[project.status]}`} />
            <div className="pl-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge kind="project" value={project.status} />
                    <StatusBadge kind="payment" value={project.paymentStatus} />
                    <PriorityBadge priority={project.priority} />
                  </div>
                  <p className="text-sm text-[#888888]">{project.client} · {project.department} · {project.type}</p>
                </div>
                {canEditProject ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant={isEditing ? "secondary" : "outline"}
                      onClick={() => { setIsEditing((c) => !c); setShowDeleteMenu(false); }}
                    >
                      <Edit3 className="h-4 w-4" />
                      Editar
                    </Button>
                    {canDeleteProject ? (
                      <div className="relative">
                        <Button
                          variant="outline"
                          onClick={() => setShowDeleteMenu((c) => !c)}
                          aria-label="Más acciones"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                        {showDeleteMenu ? (
                          <div className="absolute right-0 top-full z-20 mt-1.5 min-w-[172px] rounded-2xl border border-[#3F3F46] bg-[#1E1E20] p-1.5 shadow-xl">
                            <button
                              type="button"
                              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-danger transition-colors duration-150 hover:bg-danger/10"
                              onClick={() => { onDeleteProject(project.id); onOpenChange(false); }}
                            >
                              <Trash2 className="h-4 w-4" />
                              Eliminar proyecto
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Control administrativo */}
          {canManageProjectStatus ? (
            <div className="space-y-4 rounded-[24px] bg-[#242427] p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Control administrativo</p>
                <p className="mt-1 text-sm text-[#888888]">Estado operativo, comercial y datos de cobranza.</p>
                </div>
                <Button variant="secondary" onClick={handleAdminStatusSave}>
                  Guardar cambios
                </Button>
              </div>

              <label className={ADMIN_FIELD_CLASS}>
                <span className={ADMIN_LABEL_CLASS}>Ingeniero asignado</span>
                <select value={adminAssignedEngineerId} onChange={(e) => setAdminAssignedEngineerId(e.target.value)} className={SELECT_CLASS}>
                  <option value="">Sin ingeniero asignado</option>
                  {engineerUsers.map((user) => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className={ADMIN_FIELD_CLASS}>
                  <span className={ADMIN_LABEL_CLASS}>Estado del proyecto</span>
                  <select value={adminStatus} onChange={(e) => setAdminStatus(e.target.value as ProjectStatus)} className={SELECT_CLASS}>
                    <option value="en-programacion">En programación</option>
                    <option value="en-concurso">En concurso</option>
                    <option value="in-progress">En proceso</option>
                    <option value="pendiente-aprobacion">Pend. aprobación de proyecto</option>
                    <option value="pendiente-autorizar">Pend. de autorizar</option>
                    <option value="reasignado">Reasignado</option>
                    <option value="cierre-por-sistema">Cierre por sistema</option>
                    <option value="comparativa">Comparativa</option>
                    <option value="no-autorizado">No autorizado</option>
                    <option value="completed">Terminado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </label>
                <label className={ADMIN_FIELD_CLASS}>
                  <span className={ADMIN_LABEL_CLASS}>Modalidad contractual</span>
                  <select value={adminTipoPago} onChange={(e) => setAdminTipoPago(e.target.value as TipoPago)} className={SELECT_CLASS}>
                    <option value="">Sin definir</option>
                    {(Object.entries(TIPO_PAGO_LABELS) as [TipoPago, string][]).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className={ADMIN_FIELD_CLASS}>
                  <span className={ADMIN_LABEL_CLASS}>Estado de cobro</span>
                  <select value={adminPaymentStatus} onChange={(e) => setAdminPaymentStatus(e.target.value as PaymentStatus)} className={SELECT_CLASS}>
                    <option value="unpaid">No pagado</option>
                    <option value="partial">Pago parcial</option>
                    <option value="paid">Pagado</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className={ADMIN_FIELD_CLASS}>
                  <span className={ADMIN_LABEL_CLASS}>Urgencia</span>
                  <select value={adminPriority} onChange={(e) => setAdminPriority(e.target.value as PriorityLevel)} className={SELECT_CLASS}>
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </label>
                <label className={ADMIN_FIELD_CLASS}>
                  <span className={ADMIN_LABEL_CLASS}>Estimación</span>
                  <select value={adminEstimacion} onChange={(e) => setAdminEstimacion(e.target.value as EstimacionStatus)} className={SELECT_CLASS}>
                    <option value="">Sin definir</option>
                    {ESTIMACION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
                <label className={ADMIN_FIELD_CLASS}>
                  <span className={ADMIN_LABEL_CLASS}>Cotización</span>
                  <select value={adminCotizacion} onChange={(e) => setAdminCotizacion(e.target.value as CotizacionStatus)} className={SELECT_CLASS}>
                    <option value="">Sin definir</option>
                    {COTIZACION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className={ADMIN_FIELD_CLASS}>
                  <span className={ADMIN_LABEL_CLASS}>Fecha compromiso</span>
                  <Input type="date" value={adminCommitmentDate} onChange={(e) => setAdminCommitmentDate(e.target.value)} />
                </label>
                <label className={ADMIN_FIELD_CLASS}>
                  <span className={ADMIN_LABEL_CLASS}>Fecha de inicio</span>
                  <Input type="date" value={adminStartDate} onChange={(e) => setAdminStartDate(e.target.value)} />
                </label>
                <label className={ADMIN_FIELD_CLASS}>
                  <span className={ADMIN_LABEL_CLASS}>Fecha de finalización</span>
                  <Input type="date" value={adminEndDate} onChange={(e) => setAdminEndDate(e.target.value)} />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className={ADMIN_FIELD_CLASS}>
                  <span className={ADMIN_LABEL_CLASS}>OC del cliente</span>
                  <Input value={adminOc} onChange={(e) => setAdminOc(e.target.value)} placeholder="Número de OC o N/A" className="h-11 rounded-xl border-white/[0.07] bg-[#1F1F22]" />
                </label>
                <label className={ADMIN_FIELD_CLASS}>
                  <span className={ADMIN_LABEL_CLASS}>Total sin IVA</span>
                  <Input type="number" value={adminTotalSinIva} onChange={(e) => setAdminTotalSinIva(e.target.value)} placeholder="0.00" className="h-11 rounded-xl border-white/[0.07] bg-[#1F1F22]" />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className={ADMIN_FIELD_CLASS}>
                  <span className={ADMIN_LABEL_CLASS}>Facturar a</span>
                  <Input value={adminFacturarA} onChange={(e) => setAdminFacturarA(e.target.value)} placeholder="Razón social legal del cliente" className="h-11 rounded-xl border-white/[0.07] bg-[#1F1F22]" />
                </label>
                <label className={ADMIN_FIELD_CLASS}>
                  <span className={ADMIN_LABEL_CLASS}>Usuario de contacto</span>
                  <Input value={adminUsuarioContacto} onChange={(e) => setAdminUsuarioContacto(e.target.value)} placeholder="Persona contacto del cliente" className="h-11 rounded-xl border-white/[0.07] bg-[#1F1F22]" />
                </label>
              </div>

              <label className={ADMIN_FIELD_CLASS}>
                <span className={ADMIN_LABEL_CLASS}>Negociador (solo Prolec)</span>
                <Input value={adminNegociador} onChange={(e) => setAdminNegociador(e.target.value)} placeholder="N/A para otros clientes" className="h-11 rounded-xl border-white/[0.07] bg-[#1F1F22]" />
              </label>
            </div>
          ) : null}

          {/* Datos del proyecto — grid informativo */}
          <div className="grid gap-3 lg:grid-cols-2">
            <FieldDisplay label="Nombre estructurado" value={project.structuredName} />
            <FieldDisplay label="Ingeniero asignado" value={assignedEngineer?.name ?? "Sin asignar"} />
            <FieldDisplay
              label="Actividad resumida"
              value={
                isEditing ? (
                  <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
                ) : (
                  project.summary
                )
              }
            />
            <FieldDisplay label="Involucrados" value={project.participants.map((p) => usersById[p]?.name).filter(Boolean).join(", ") || "Sin participantes"} />
            <FieldDisplay label="Modalidad contractual" value={project.tipoPago ? TIPO_PAGO_LABELS[project.tipoPago] : "Sin definir"} />
            <FieldDisplay label="OC cliente" value={project.oc ?? "—"} />
            <FieldDisplay label="Facturar a" value={project.facturarA ?? "—"} />
            <FieldDisplay label="Usuario de contacto" value={project.usuarioContacto ?? "—"} />
            <FieldDisplay label="Estimación" value={project.estimacion ?? "—"} />
            <FieldDisplay label="Cotización" value={project.cotizacion ?? "—"} />
            <FieldDisplay label="Total contratado" value={mxn(project.totalContratado)} />
            <FieldDisplay label="Total sin IVA" value={project.totalSinIva ? mxn(project.totalSinIva) : "—"} />
            <FieldDisplay label="Fecha compromiso" value={formatOptionalDate(project.commitmentDate)} />
            <FieldDisplay label="Fecha de inicio" value={formatOptionalDate(project.startDate)} />
            <FieldDisplay label="Fecha de finalización" value={formatOptionalDate(project.endDate)} />
            <FieldDisplay label="Fecha de solicitud" value={formatDate(project.createdAt)} />
            <FieldDisplay label="Actualizado" value={formatDate(project.updatedAt)} />
            <FieldDisplay label="Estado de cobro" value={project.paymentLabel} />
          </div>

          <FieldDisplay
            label="Descripción"
            value={
              isEditing ? (
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[180px]" />
              ) : (
                project.description
              )
            }
          />

          {isEditing ? (
            <div className="flex justify-end">
              <Button onClick={handleSave}>
                <Save className="h-4 w-4" />
                Guardar cambios
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── TAB FACTURACIÓN ── */}
      {tab === "facturas" ? (
        <div className="mt-5 space-y-4">
          {canManageInvoices && onAddInvoice ? (
            <div className="rounded-[26px] border border-accent/15 bg-accent/[0.05] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-accent">
                  <Receipt className="h-4 w-4" />
                  Solicitar factura
                </div>
                <Button variant="outline" onClick={() => setShowInvoiceForm((c) => !c)}>
                  {showInvoiceForm ? "Cancelar" : <><Plus className="h-4 w-4" />Nueva factura</>}
                </Button>
              </div>

              {showInvoiceForm ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888888]">Fecha de solicitud</span>
                      <Input type="date" value={invoiceDraft.fechaSolicitud} onChange={(e) => setInvoiceDraft((c) => ({ ...c, fechaSolicitud: e.target.value }))} />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888888]">OC cliente</span>
                      <Input value={invoiceDraft.oc} onChange={(e) => setInvoiceDraft((c) => ({ ...c, oc: e.target.value }))} placeholder="Número de OC o N/A" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888888]">Subtotal (con IVA)</span>
                      <Input type="number" value={invoiceDraft.subtotal} onChange={(e) => setInvoiceDraft((c) => ({ ...c, subtotal: e.target.value }))} placeholder="0.00" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888888]">Abono antes de IVA</span>
                      <Input type="number" value={invoiceDraft.abonoAntesIva} onChange={(e) => setInvoiceDraft((c) => ({ ...c, abonoAntesIva: e.target.value }))} placeholder="0.00 (opcional)" />
                    </label>
                  </div>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888888]">Facturar a (razón social)</span>
                    <Input value={invoiceDraft.facturarA} onChange={(e) => setInvoiceDraft((c) => ({ ...c, facturarA: e.target.value }))} placeholder="Razón social legal" />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888888]">Método de pago (MDP)</span>
                      <select
                        value={invoiceDraft.mdp}
                        onChange={(e) => setInvoiceDraft((c) => ({
                          ...c,
                          mdp: e.target.value as MDP,
                          complementoPago: e.target.value === "PUE" ? "N/A" : c.complementoPago,
                        }))}
                        className={SELECT_CLASS}
                      >
                        <option value="PPD">PPD — Pago en Parcialidades o Diferido</option>
                        <option value="PUE">PUE — Pago en Una Exhibición</option>
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888888]">Complemento de pago</span>
                      <Input
                        value={invoiceDraft.mdp === "PUE" ? "N/A (automático)" : invoiceDraft.complementoPago}
                        disabled={invoiceDraft.mdp === "PUE"}
                        onChange={(e) => setInvoiceDraft((c) => ({ ...c, complementoPago: e.target.value }))}
                        placeholder="Número de complemento"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888888]">Promesa de pago</span>
                      <Input type="date" value={invoiceDraft.promesaPago} onChange={(e) => setInvoiceDraft((c) => ({ ...c, promesaPago: e.target.value }))} />
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={handleAddInvoice}
                      disabled={!invoiceDraft.oc.trim() || !invoiceDraft.subtotal || !invoiceDraft.facturarA.trim()}
                    >
                      <Receipt className="h-4 w-4" />
                      Solicitar factura
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {invoices.length > 0 ? (
            <div className="space-y-3">
              {invoices.map((invoice) => {
                const stuck = invoice.status === "solicitada" || invoice.status === "en-portal";
                return (
                  <div
                    key={invoice.id}
                    className={`relative overflow-hidden rounded-[24px] bg-[#27272A] p-5 transition-all duration-200 ${stuck ? "ring-1 ring-[#F5A524]/35 shadow-[0_0_12px_rgba(245,165,36,0.08)]" : "ring-1 ring-[#3F3F46]/60"}`}
                  >
                    {/* Franja lateral de status */}
                    <div className={`absolute left-0 top-0 h-full w-1.5 rounded-l-[24px] ${INVOICE_STRIPE[invoice.status]}`} />

                    <div className="pl-3">
                      {/* Encabezado: steps + alerta si atascada */}
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <InvoiceProgressSteps status={invoice.status} />
                        {stuck ? (
                          <div className="flex items-center gap-1.5 rounded-full bg-[#F5A524]/10 px-2.5 py-1 text-[11px] font-semibold text-[#F5A524]">
                            <AlertCircle className="h-3 w-3" />
                            Pendiente de avance
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          {invoice.factura ? (
                            <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
                              {invoice.factura}
                            </span>
                          ) : null}
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                            <span className="text-[#888888]">OC</span>
                            <span className="font-semibold text-foreground">{invoice.oc}</span>
                            <span className="text-[#888888]">Subtotal</span>
                            <span className="font-bold text-foreground tabular-nums">{mxn(invoice.subtotal)}</span>
                            <span className="text-[#888888]">Facturar a</span>
                            <span className="font-medium text-foreground">{invoice.facturarA}</span>
                            <span className="text-[#888888]">MDP</span>
                            <span className="font-medium text-foreground">{invoice.mdp}</span>
                            {invoice.promesaPago ? (
                              <>
                                <span className="text-[#888888]">Promesa pago</span>
                                <span className="font-medium text-foreground">{formatDate(invoice.promesaPago)}</span>
                              </>
                            ) : null}
                            {invoice.fechaPago ? (
                              <>
                                <span className="text-[#888888]">Fecha pago</span>
                                <span className="font-semibold text-accent">{formatDate(invoice.fechaPago)}</span>
                              </>
                            ) : null}
                            {invoice.complementoPago && invoice.complementoPago !== "N/A" ? (
                              <>
                                <span className="text-[#888888]">Complemento</span>
                                <span className="font-medium text-foreground">{invoice.complementoPago}</span>
                              </>
                            ) : null}
                            {invoice.abonoAntesIva ? (
                              <>
                                <span className="text-[#888888]">Abono antes IVA</span>
                                <span className="font-medium text-foreground">{mxn(invoice.abonoAntesIva)}</span>
                              </>
                            ) : null}
                          </div>
                        </div>

                        {canManageInvoices && onUpdateInvoice ? (
                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#888888]">Actualizar estado</span>
                            <select
                              value={invoice.status}
                              onChange={(e) => {
                                const newStatus = e.target.value as InvoiceStatus;
                                const extra: Partial<InvoiceItem> = { status: newStatus };
                                if (newStatus === "pagada") extra.fechaPago = new Date().toISOString().slice(0, 10);
                                onUpdateInvoice(project.id, invoice.id, extra);
                              }}
                              className="h-10 min-w-[200px] rounded-2xl border border-[#3F3F46] bg-[#313136] px-3 text-sm font-semibold text-foreground outline-none transition focus:border-accent/50"
                            >
                              {(Object.entries(INVOICE_STATUS_LABELS) as [InvoiceStatus, string][]).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                              ))}
                            </select>
                            {invoice.status === "recibida" ? (
                              <Input
                                value={invoice.factura ?? ""}
                                onChange={(e) => onUpdateInvoice!(project.id, invoice.id, { factura: e.target.value })}
                                placeholder="Número de factura"
                                className="h-10 text-sm"
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <p className="mt-3 border-t border-[#3F3F46]/50 pt-3 text-xs text-[#888888]">
                        Solicitada {formatDate(invoice.fechaSolicitud)} · por {usersById[invoice.createdBy]?.name ?? "Sistema"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-[#3F3F46] bg-[#27272A] p-10 text-center">
              <Receipt className="mx-auto mb-3 h-8 w-8 text-[#52525B]" />
              <p className="text-sm font-medium text-[#888888]">No hay facturas registradas en este proyecto.</p>
            </div>
          )}
        </div>
      ) : null}

      {/* ── TAB ARCHIVOS ── */}
      {tab === "files" ? (() => {
        const imageFiles = project.files.filter((f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name));
        const docFiles = project.files.filter((f) => !/\.(png|jpg|jpeg|gif|webp)$/i.test(f.name));
        return (
          <div className="mt-5 space-y-4">
            {/* Hidden inputs */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              multiple
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                if (!files.length || !onUploadFile) return;
                setUploadError(null);
                setIsUploading(true);
                try {
                  for (const f of files) { await onUploadFile(project.id, f); }
                } catch (err) {
                  setUploadError(err instanceof Error ? err.message : "Error al subir archivo");
                } finally {
                  setIsUploading(false);
                  e.target.value = "";
                }
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              capture="environment"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !onUploadFile) return;
                setUploadError(null);
                setIsUploading(true);
                try {
                  await onUploadFile(project.id, file);
                } catch (err) {
                  setUploadError(err instanceof Error ? err.message : "Error al subir foto");
                } finally {
                  setIsUploading(false);
                  e.target.value = "";
                }
              }}
            />

            {/* Zona de arrastre compacta */}
            {canEditProject ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
                onDrop={async (e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (!onUploadFile) return;
                  const files = Array.from(e.dataTransfer.files);
                  if (!files.length) return;
                  setUploadError(null);
                  setIsUploading(true);
                  try {
                    for (const f of files) { await onUploadFile(project.id, f); }
                  } catch (err) {
                    setUploadError(err instanceof Error ? err.message : "Error al subir archivo");
                  } finally {
                    setIsUploading(false);
                  }
                }}
                className={`rounded-2xl border-2 border-dashed px-4 py-3 transition-all duration-200 ${isDragging ? "border-accent/60 bg-accent/5 scale-[1.005]" : "border-[#3F3F46] bg-[#27272A]/40"}`}
              >
                {isUploading ? (
                  <div className="flex items-center justify-center gap-2.5 py-1">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    <p className="text-sm font-semibold text-accent">Subiendo...</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-[#888888]">
                      <FileUp className={`h-4 w-4 shrink-0 transition-colors ${isDragging ? "text-accent" : ""}`} />
                      <span>{isDragging ? "Suelta para subir" : "Arrastra imágenes o archivos aquí"}</span>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="secondary" onClick={() => { setUploadError(null); fileInputRef.current?.click(); }} disabled={isUploading}>
                        <Images className="h-4 w-4" />
                        Galería
                      </Button>
                      <Button variant="outline" onClick={() => { setUploadError(null); cameraInputRef.current?.click(); }} disabled={isUploading}>
                        <Camera className="h-4 w-4" />
                        Cámara
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {uploadError ? (
              <div className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
                {uploadError}
              </div>
            ) : null}

            {/* Galería de imágenes */}
            {imageFiles.length > 0 ? (
              <div className="space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#888888]">
                  Fotos e imágenes · {imageFiles.length}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {imageFiles.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => file.url && setLightboxUrl(file.url)}
                      className="group relative aspect-square overflow-hidden rounded-2xl bg-[#313136] ring-1 ring-white/5 transition-all duration-200 hover:ring-accent/40 hover:shadow-lg"
                    >
                      <img
                        src={file.url}
                        alt={file.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                      {/* Overlay con nombre al hacer hover */}
                      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/75 via-black/10 to-transparent p-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <p className="truncate text-left text-[11px] font-semibold text-white">{file.name}</p>
                        <p className="text-left text-[10px] text-white/60">{file.sizeLabel}</p>
                      </div>
                      {/* Botón descargar */}
                      {file.url ? (
                        <div className="absolute right-2 top-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                          <a
                            href={file.url}
                            download={file.name}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80">
                              <Download className="h-3.5 w-3.5" />
                            </div>
                          </a>
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Lista de documentos */}
            {docFiles.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#888888]">
                  Documentos · {docFiles.length}
                </p>
                <div className="space-y-1.5">
                  {docFiles.map((file) => (
                    <div key={file.id} className="flex items-center gap-3 rounded-[18px] bg-[#313136]/50 px-3 py-2.5 transition-colors hover:bg-[#313136]/80">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#3F3F46] text-[10px] font-black uppercase text-[#A1A1AA]">
                        {file.name.split(".").pop()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{file.name}</p>
                        <p className="text-xs text-[#888888]">{file.sizeLabel} · {formatDate(file.uploadedAt)}</p>
                      </div>
                      {file.url ? (
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            onClick={() => window.open(file.url, "_blank")}
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#3F3F46] text-[#888888] transition-colors hover:border-accent/40 hover:text-accent"
                            title="Abrir"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <a href={file.url} download={file.name} target="_blank" rel="noreferrer">
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#3F3F46] text-[#888888] transition-colors hover:border-accent/40 hover:text-accent"
                              title="Descargar"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </a>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Estado vacío */}
            {project.files.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-[#3F3F46] bg-[#27272A]/50 p-10 text-center">
                <Images className="mx-auto mb-3 h-8 w-8 text-[#3F3F46]" />
                <p className="text-sm font-semibold text-[#888888]">Sin archivos subidos</p>
                <p className="mt-1 text-xs text-[#52525B]">Arrastra fotos de WhatsApp, de escritorio o usa la cámara.</p>
              </div>
            ) : null}
          </div>
        );
      })() : null}

      {/* ── TAB GASTOS ── */}
      {tab === "gastos" ? (
        <GastosProyecto
          expenses={project.expenses}
          totalContratado={project.totalContratado}
          canAdd={canAddExpense}
          canDelete={canDeleteExpense}
          canEditBudget={canEditBudget}
          onAddExpense={(expense) => onAddExpense(project.id, expense)}
          onDeleteExpense={(expenseId) => onDeleteExpense(project.id, expenseId)}
          onUpdateBudget={(amount) => onUpdateBudget(project.id, amount)}
        />
      ) : null}

      {/* ── TAB CALENDARIO ── */}
      {tab === "calendar" ? (
        <div className="mt-5 space-y-5">
          {canManageProjectCalendar ? (
            <div className="rounded-[28px] border border-accent/15 bg-accent/[0.05] p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-accent/15 p-3 text-accent">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Agregar fecha importante</h3>
                  <p className="text-sm text-[#888888]">Esta fecha aparecerá en los calendarios de los involucrados.</p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1fr,180px]">
                <Input value={importantDateTitle} onChange={(e) => setImportantDateTitle(e.target.value)} placeholder="Título de la fecha" />
                <Input type="date" value={importantDateValue} onChange={(e) => setImportantDateValue(e.target.value)} />
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={handleAddImportantDate} disabled={!importantDateTitle.trim() || !importantDateValue}>
                  <Plus className="h-4 w-4" />
                  Agregar fecha
                </Button>
              </div>
            </div>
          ) : null}

          <div className="rounded-[28px] bg-[#27272A] p-5 shadow-card">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-secondary/15 p-3 text-secondary">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Calendario del proyecto</h3>
                <p className="text-sm text-[#888888]">Compromisos y fechas importantes internas.</p>
              </div>
            </div>
            <div className="space-y-3">
              {project.commitmentDate ? (
                <div className="rounded-[20px] border border-secondary/20 bg-secondary/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">Fecha compromiso</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{formatDate(project.commitmentDate)}</p>
                </div>
              ) : null}
              {(project.importantDates ?? []).map((item) => (
                <div key={item.id} className="rounded-[20px] border border-warning/20 bg-warning/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F5A524]">{item.title}</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{formatDate(item.date)}</p>
                </div>
              ))}
              {!project.commitmentDate && (project.importantDates ?? []).length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-[#3F3F46] bg-[#313136]/50 p-8 text-center text-sm text-[#888888]">
                  No hay fechas en este proyecto.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── TAB CHAT ── */}
      {tab === "chat" ? (
        <div className="mt-5 space-y-4">
          <div className="min-h-[120px] space-y-3 rounded-[28px] bg-[#1E1E20] p-4">
            {project.comments.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#52525B]">Sin comentarios todavía. Sé el primero.</p>
            ) : null}
            {project.comments.map((comment) => {
              const author = usersById[comment.authorId];
              const isMine = comment.authorId === currentUser.id;
              return (
                <div key={comment.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-[24px] px-4 py-3 text-sm shadow-soft ${isMine ? "bg-accent text-[#111111]" : "bg-[#3F3F46] text-foreground"}`}>
                    <div className="mb-1 flex items-center gap-2 text-xs font-medium opacity-80">
                      <span>{author?.name ?? "Usuario"}</span>
                      {comment.isPriority ? <span className="rounded-full bg-danger/20 px-2 py-0.5 text-danger">Prioritario</span> : null}
                    </div>
                    <p>{comment.message}</p>
                    <p className="mt-1 text-[10px] opacity-60">{formatDate(comment.createdAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-[28px] bg-[#27272A] p-4">
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Escribe un comentario operativo o de coordinación." className="min-h-[120px]" />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[#888888] transition-colors hover:text-foreground">
                <input type="checkbox" checked={isPriority} onChange={(e) => setIsPriority(e.target.checked)} className="h-4 w-4 accent-danger" />
                Marcar comentario como prioritario
              </label>
              <Button
                onClick={() => {
                  if (!message.trim()) return;
                  onAddComment(project.id, message.trim(), isPriority, currentUser.id);
                  setMessage("");
                  setIsPriority(false);
                }}
              >
                <MessageCircleMore className="h-4 w-4" />
                Enviar comentario
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── LIGHTBOX ── */}
      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setLightboxUrl(null); }}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#27272A]/80 text-[#A1A1AA] transition-colors hover:bg-[#3F3F46] hover:text-white"
            aria-label="Cerrar"
          >
            <XCircle className="h-6 w-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Vista de imagen"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      {/* ── TAB HISTORIAL ── */}
      {tab === "history" ? (
        <div className="mt-5">
          {project.history.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[#3F3F46] bg-[#27272A] p-10 text-center text-sm text-[#888888]">
              Sin historial registrado.
            </div>
          ) : (
            <div className="relative space-y-0 pl-6">
              {/* Línea vertical del timeline */}
              <div className="absolute left-[9px] top-3 h-[calc(100%-24px)] w-px bg-[#3F3F46]" />
              {project.history.map((item, idx) => (
                <div key={item.id} className={`relative pb-4 ${idx === project.history.length - 1 ? "pb-0" : ""}`}>
                  {/* Dot */}
                  <div className="absolute -left-[19px] top-[18px] h-3 w-3 rounded-full border-2 border-[#27272A] bg-secondary" />
                  <div className="rounded-[20px] bg-[#313136]/50 p-4 transition-colors duration-150 hover:bg-[#313136]/80">
                    <p className="text-sm font-semibold text-foreground">{item.action}</p>
                    <p className="mt-1 text-xs text-[#888888]">{formatDate(item.createdAt)} · {item.author}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
