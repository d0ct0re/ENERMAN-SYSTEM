import {
  Camera, Check, ChevronDown, ChevronLeft, ChevronRight,
  Download, Eye, FileUp, Folder, FolderOpen,
  MessageCircleMore, MoreVertical, Plus, Trash2, X, XCircle, ZoomIn,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type ChatMessage, realtime } from "@/lib/realtime";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import {
  CotizacionStatus, EstimacionStatus, ExpenseCategory, ExpenseType, FileCategory, FileStatus,
  InvoiceItem, InvoiceStatus, MDP, PagoProyecto, PaymentStatus, PriorityLevel,
  ProjectExpenseItem, ProjectItem, ProjectStatus, ProjectType, PROJECT_TYPE_LABELS,
  UbicacionProyecto, UserItem,
} from "@/types";
import { StatusBadge } from "@/components/common/status-badge";
import { PriorityBadge } from "@/components/common/priority-badge";
import { formatDate, parseLocalDate } from "@/lib/utils";
import { resolveImgUrl, serveFileUrl } from "@/lib/api";
import type { ProjectFileItem } from "@/types";

type MainTab = "info" | "chat" | "archivos";
type InfoTab = "f1" | "f2" | "f3" | "f4";

// ── Estilos base ──────────────────────────────────────────────
const INP = "h-11 w-full rounded-xl border border-white/[0.07] bg-bg-input px-3 text-sm font-semibold text-foreground outline-none transition focus:border-info/50 focus:ring-2 focus:ring-info/10 disabled:cursor-not-allowed disabled:opacity-50";
const INP_RO = "h-11 w-full rounded-xl border border-white/[0.04] bg-base px-3 text-sm font-semibold text-ink-tertiary outline-none cursor-not-allowed";
const LBL = "text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground";

// Contenedor de campo normal (azul — ambos pueden editar)
const FLD = "space-y-1.5";
// Contenedor de campo admin (naranja — solo Admin)
const FLD_ADM = "space-y-1.5 border-l-2 border-orange-400/40 pl-3";

// Sufijos de etiqueta
function LabelAdmin({ text }: { text: string }): JSX.Element {
  return (
    <span className={LBL}>
      {text}<span className="text-orange-400/90"> · ADMIN</span>
    </span>
  );
}
function LabelAuto({ text }: { text: string }): JSX.Element {
  return (
    <span className={LBL}>
      {text}<span className="text-success/90"> · AUTO</span>
    </span>
  );
}

// ── Mapeos urgencia/prioridad ──────────────────────────────────
const URGENCIA_TO_PRIORITY: Record<string, PriorityLevel> = {
  Bajo: "low", Medio: "medium", Alto: "high", Emergencia: "critical",
};
const PRIORITY_TO_URGENCIA: Record<PriorityLevel, string> = {
  low: "Bajo", medium: "Medio", high: "Alto", critical: "Emergencia",
};

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "en-programacion", label: "En programación" },
  { value: "en-concurso", label: "En concurso" },
  { value: "in-progress", label: "En proceso" },
  { value: "pendiente-aprobacion", label: "Pend. aprobación" },
  { value: "pendiente-autorizar", label: "Pend. de autorizar" },
  { value: "reasignado", label: "Reasignado" },
  { value: "cierre-por-sistema", label: "Cierre por sistema" },
  { value: "comparativa", label: "Comparativa" },
  { value: "no-autorizado", label: "No autorizado" },
  { value: "completed", label: "Terminado" },
  { value: "cancelled", label: "Cancelado" },
];

const ESTIMACION_OPTIONS: EstimacionStatus[] = [
  "Pendiente", "Realizada", "Cancelada", "Comparativa", "N/A", "Sin información",
];
const COTIZACION_OPTIONS: CotizacionStatus[] = [
  "Pendiente", "Realizada", "Enviada", "Revisión", "Cancelada", "Comparativa", "N/A", "Sin información",
];

// Picker de fecha en DD/MM/AAAA — definido a nivel de módulo para que React no lo
// desmonte/remonte en cada render del diálogo (si se define dentro del componente,
// cada render crea una nueva referencia de función y React trata el elemento como
// un tipo distinto, forzando un remount que rompe el foco del calendario nativo).
function DatePickerMX({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  const display = value ? value.split("-").reverse().join("/") : "";
  return (
    <div className="relative">
      <div className={`${INP} flex items-center pointer-events-none select-none`} aria-hidden>
        {display || <span className="text-ink-tertiary">DD/MM/AAAA</span>}
      </div>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full cursor-pointer border-0 bg-transparent outline-none rounded-xl"
        style={{ color: "transparent" }}
      />
    </div>
  );
}

// ── Borrador inline de pago (F4) ──────────────────────────────
interface PagoDraft {
  id: string;
  numeroPago: number;
  estado: "pendiente" | "realizado";
  promesaPago: string;
  tipoPagoAbono: "PPD" | "PUE" | "Contado";
  factura: string;
  mdp: "PPD" | "PUE";
  complementoPago: string;
  fechaPago: string;
  subtotalAbono: string;
  createdAt: string;
}

function createEmptyPago(num: number): PagoDraft {
  return {
    id: crypto.randomUUID(),
    numeroPago: num,
    estado: "pendiente",
    promesaPago: "",
    tipoPagoAbono: "Contado",
    factura: "",
    mdp: "PPD",
    complementoPago: "",
    fechaPago: "",
    subtotalAbono: "",
    createdAt: new Date().toISOString(),
  };
}

function pagoDraftFromSaved(p: PagoProyecto): PagoDraft {
  return {
    id: p.id,
    numeroPago: p.numeroPago,
    estado: p.estado ?? "pendiente",
    promesaPago: p.promesaPago ?? "",
    tipoPagoAbono: p.tipoPagoAbono ?? "Contado",
    factura: p.factura ?? "",
    mdp: p.mdp ?? "PPD",
    complementoPago: p.complementoPago ?? "",
    fechaPago: p.fechaPago ?? "",
    subtotalAbono: p.subtotalAbono.toString(),
    createdAt: p.createdAt,
  };
}

// ── Props ──────────────────────────────────────────────────────
export interface ProjectDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectItem;
  users: UserItem[];
  currentUser: UserItem;
  canEditProject: boolean;
  canManageProjectStatus: boolean;
  canEditBudget: boolean;
  canDeleteProject: boolean;
  canManageInvoices?: boolean;
  onUpdateProject: (projectId: string, fields: Partial<ProjectItem> & { assignedEngineerId?: string }) => Promise<void> | void;
  onAddComment: (projectId: string, message: string, isPriority: boolean, authorId: string) => void;
  onMessageSent?: (projectId: string, authorId: string, authorName: string, message: string, isPriority: boolean) => void;
  onUploadFile?: (projectId: string, file: File, category?: FileCategory) => Promise<void>;
  onDeleteFile?: (projectId: string, fileId: string, category: FileCategory) => Promise<void>;
  onDeleteProject: (projectId: string) => void;
  clientOptions?: string[];
  departmentOptions?: string[];
  onAddExpense?: (projectId: string, expense: Omit<ProjectExpenseItem, "id" | "createdAt" | "creadoPor">) => void;
  onDeleteExpense?: (projectId: string, expenseId: string) => void;
  onAddInvoice?: (projectId: string, invoice: Omit<InvoiceItem, "id" | "createdAt" | "createdBy">) => void;
  onUpdateInvoice?: (projectId: string, invoiceId: string, updates: Partial<InvoiceItem>) => void;
  onAddProjectImportantDate?: (projectId: string, payload: { title: string; date: string }) => void;
  // Legacy / sin UI aún
  onSaveProject?: (...args: unknown[]) => void;
  onAdminUpdateProject?: (...args: unknown[]) => void;
  canManageProjectCalendar?: boolean;
  canAddExpense?: boolean;
  canDeleteExpense?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────
function mxn(val?: number): string {
  if (val === undefined || val === null || isNaN(val)) return "$0";
  return new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", minimumFractionDigits: 0,
  }).format(val);
}

function n(s: string): number | undefined {
  const v = parseFloat(s);
  return isNaN(v) ? undefined : v;
}

// ── Componente principal ───────────────────────────────────────
export function ProjectDetailDialog({
  open, onOpenChange, project, users, currentUser,
  canEditProject, canManageProjectStatus, canEditBudget, canDeleteProject, canManageInvoices,
  onUpdateProject, onAddComment, onUploadFile, onDeleteFile, onDeleteProject, onMessageSent,
  onAddExpense, onDeleteExpense, onAddInvoice, onUpdateInvoice, onAddProjectImportantDate,
  clientOptions = [], departmentOptions = [],
}: ProjectDetailDialogProps): JSX.Element | null {
  const [mainTab, setMainTab] = useState<MainTab>("info");
  const [infoTab, setInfoTab] = useState<InfoTab>("f1");
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);

  // ── F1 state ──
  const [f1Client, setF1Client] = useState("");
  const [f1Department, setF1Department] = useState("");
  const [f1Lugar, setF1Lugar] = useState("");
  const [f1Type, setF1Type] = useState<ProjectType>("INST");
  const [f1Urgencia, setF1Urgencia] = useState("Medio");
  const [f1EngineerId, setF1EngineerId] = useState("");
  const [f1Negociador, setF1Negociador] = useState("");
  const [f1ContactUser, setF1ContactUser] = useState("");
  const [f1BaseName, setF1BaseName] = useState("");
  const [f1Description, setF1Description] = useState("");
  const [f1Ubicacion, setF1Ubicacion] = useState<UbicacionProyecto>({});

  const [f1TotalContratado, setF1TotalContratado] = useState("");

  // ── F1 — Fechas importantes form ──
  const [showDateForm, setShowDateForm] = useState(false);
  const [dateTitle, setDateTitle] = useState("");
  const [dateValue, setDateValue] = useState("");

  // ── F2 state ──
  const [f2Status, setF2Status] = useState<ProjectStatus>("en-programacion");
  const [f2Estimacion, setF2Estimacion] = useState<EstimacionStatus | "">("");
  const [f2Cotizacion, setF2Cotizacion] = useState<CotizacionStatus | "">("");
  const [f2PaymentStatus, setF2PaymentStatus] = useState<PaymentStatus>("unpaid");
  const [f2FechaSolicitud, setF2FechaSolicitud] = useState("");
  const [f2StartDate, setF2StartDate] = useState("");
  const [f2EndDate, setF2EndDate] = useState("");
  const [f2CommitmentDate, setF2CommitmentDate] = useState("");
  const [f2Fotos, setF2Fotos] = useState(false);
  const [f2FotosStatus,      setF2FotosStatus]      = useState<FileStatus>("no");
  const [f2EstimFileStatus, setF2EstimFileStatus] = useState<FileStatus>("no");
  const [f2CotizFileStatus, setF2CotizFileStatus] = useState<FileStatus>("no");
  const [f2ReporteFileStatus, setF2ReporteFileStatus] = useState<FileStatus>("no");
  const [f2OtrosFileStatus, setF2OtrosFileStatus] = useState<FileStatus>("no");
  const [f2Reporte, setF2Reporte] = useState(false);
  const [f2Autorizador, setF2Autorizador] = useState("");
  const [f2Comentarios, setF2Comentarios] = useState("");

  // ── F3 state ──
  const [f3TotalSinIva, setF3TotalSinIva] = useState("");
  const [f3Iva, setF3Iva] = useState("");
  const [f3Materiales, setF3Materiales] = useState("");
  const [f3Servicios, setF3Servicios] = useState("");
  const [f3Personal, setF3Personal] = useState("");
  const [f3SvoContratado, setF3SvoContratado] = useState("");
  const [f3Comision, setF3Comision] = useState("");
  const [f3OtrosGastos, setF3OtrosGastos] = useState("");
  const [f3Oapc, setF3Oapc] = useState("");
  const [f3Egpc, setF3Egpc] = useState("");
  const [f3Luna, setF3Luna] = useState("");
  const [f3PagoPadillas, setF3PagoPadillas] = useState(true);
  const [f3EstatusTrabajo, setF3EstatusTrabajo] = useState<"Pendiente" | "Pagado">("Pendiente");
  const [f3EstatusAlberto, setF3EstatusAlberto] = useState<"Pendiente" | "Pagado">("Pendiente");
  const [f3EstatusLuna, setF3EstatusLuna] = useState<"Pendiente" | "Pagado">("Pendiente");
  const [f3ComentariosDireccion, setF3ComentariosDireccion] = useState("");

  // ── F4 state ──
  const [pagoDrafts, setPagoDrafts] = useState<PagoDraft[]>([createEmptyPago(1)]);
  const [f4EstatusFinal, setF4EstatusFinal] = useState<"Pendiente" | "Pagado">("Pendiente");

  // ── Saving states ──
  const [savingF1, setSavingF1] = useState(false);
  const [savingF2, setSavingF2] = useState(false);
  const [savingF3, setSavingF3] = useState(false);
  const [savingF4, setSavingF4] = useState(false);

  // ── Expense form (F3) ──
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expTitulo, setExpTitulo] = useState("");
  const [expMonto, setExpMonto] = useState("");
  const [expTipo, setExpTipo] = useState<ExpenseType>("material");
  const [expCategoria, setExpCategoria] = useState<ExpenseCategory>("material");
  const [expFecha, setExpFecha] = useState(() => new Date().toISOString().slice(0, 10));

  // ── Invoice form (F4) ──
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invOc, setInvOc] = useState("");
  const [invSubtotal, setInvSubtotal] = useState("");
  const [invFacturarA, setInvFacturarA] = useState("");
  const [invMdp, setInvMdp] = useState<MDP>("PPD");
  const [invFechaSolicitud, setInvFechaSolicitud] = useState(() => new Date().toISOString().slice(0, 10));

  // ── Chat ──
  const [message, setMessage] = useState("");
  const [isPriority, setIsPriority] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Archivos ──
  const [uploadingSection, setUploadingSection] = useState<FileCategory | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draggingSection, setDraggingSection] = useState<FileCategory | null>(null);
  // ── Galería de imágenes ──
  const [galleryFiles, setGalleryFiles] = useState<ProjectFileItem[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryBroken, setGalleryBroken] = useState(false);
  // aliases de compatibilidad (usados en la sección de documentos al abrir imagen)
  const lightboxFile = galleryFiles[galleryIndex] ?? null;
  const lightboxUrl  = galleryFiles.length > 0 ? serveFileUrl(project?.id ?? "", galleryFiles[galleryIndex]?.id ?? "") : null;
  const setLightboxBroken = setGalleryBroken;

  const openGallery = (files: ProjectFileItem[], startId: string) => {
    const idx = files.findIndex(f => f.id === startId);
    setGalleryFiles(files);
    setGalleryIndex(idx >= 0 ? idx : 0);
    setGalleryBroken(false);
  };
  const closeGallery = () => { setGalleryFiles([]); setGalleryIndex(0); };
  const galleryPrev = () => { setGalleryBroken(false); setGalleryIndex(i => (i - 1 + galleryFiles.length) % galleryFiles.length); };
  const galleryNext = () => { setGalleryBroken(false); setGalleryIndex(i => (i + 1) % galleryFiles.length); };
  const [openSections, setOpenSections] = useState<Record<FileCategory, boolean>>({
    fotos: true, estimacion: false, cotizacion: false, reporte: false, otros: false,
  });
  const fotosFileInputRef = useRef<HTMLInputElement>(null);
  const estimacionFileInputRef = useRef<HTMLInputElement>(null);
  const cotizacionFileInputRef = useRef<HTMLInputElement>(null);
  const reporteFileInputRef = useRef<HTMLInputElement>(null);
  const otrosFileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ── Computed ──
  const usersById = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u])),
    [users],
  );
  const engineerUsers = useMemo(
    () => users.filter((u) => u.role === "engineer" && u.isActive !== false),
    [users],
  );
  const assignedEngineer = useMemo(() => {
    if (!project) return undefined;
    return engineerUsers.find(
      (u) => u.id === project.createdBy || project.participants.includes(u.id),
    );
  }, [engineerUsers, project]);

  const consecutivo = useMemo(
    () => (project ? project.structuredName.split("-")[0] : "—"),
    [project],
  );

  const ganancia = useMemo(() => {
    const total = parseFloat(f3TotalSinIva) || 0;
    const costos = [f3Materiales, f3Servicios, f3Personal, f3SvoContratado, f3Comision, f3OtrosGastos]
      .map((v) => parseFloat(v) || 0)
      .reduce((a, b) => a + b, 0);
    return total - costos;
  }, [f3TotalSinIva, f3Materiales, f3Servicios, f3Personal, f3SvoContratado, f3Comision, f3OtrosGastos]);

  const abonoTotal = useMemo(
    () => pagoDrafts.filter((p) => p.estado === "realizado").reduce((s, p) => s + (parseFloat(p.subtotalAbono) || 0), 0),
    [pagoDrafts],
  );
  const porCobrar = useMemo(
    () => (parseFloat(f3TotalSinIva) || project?.totalSinIva || 0) - abonoTotal,
    [f3TotalSinIva, project?.totalSinIva, abonoTotal],
  );

  const progress = useMemo(() => {
    if (!project) return 0;
    let done = 0;
    if (project.client) done++;
    if (project.status !== "en-programacion" || project.startDate) done++;
    if (project.totalSinIva) done++;
    if ((project.pagosProyecto?.length ?? 0) > 0) done++;
    return Math.round((done / 4) * 100);
  }, [project]);

  // Muestra fecha en formato inequívoco (dd mmm aaaa) sin importar el locale del navegador.
  const fmtHint = (d: string): string => {
    if (!d) return "";
    try { return parseLocalDate(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return ""; }
  };

  // DatePickerMX se define a nivel de módulo (ver arriba del archivo).

  // ── Archivos por sección ──
  const filesBySection = useMemo<Record<FileCategory, import("@/types").ProjectFileItem[]>>(() => {
    const map: Record<FileCategory, import("@/types").ProjectFileItem[]> = { fotos: [], estimacion: [], cotizacion: [], reporte: [], otros: [] };
    for (const f of (project?.files ?? [])) {
      const cat: FileCategory = f.category ?? (/\.(png|jpg|jpeg|gif|webp)$/i.test(f.name) ? "fotos" : "reporte");
      map[cat].push(f);
    }
    return map;
  }, [project?.files]);

  // ── Reset al cambiar de proyecto ──
  useEffect(() => {
    if (!project) return;
    setMainTab("info");
    setInfoTab("f1");
    setShowDeleteMenu(false);
    // F1
    setF1Client(project.client ?? "");
    setF1Department(project.department ?? "");
    setF1Lugar(project.lugar ?? "");
    setF1Type(project.type ?? "INST");
    setF1Urgencia(PRIORITY_TO_URGENCIA[project.priority] ?? "Medio");
    setF1EngineerId(
      engineerUsers.find(
        (u) => u.id === project.createdBy || project.participants.includes(u.id),
      )?.id ?? "",
    );
    setF1Negociador(project.negociador ?? "");
    setF1ContactUser(project.usuarioContacto ?? "");
    setF1BaseName(project.baseName ?? "");
    setF1Description(project.description ?? "");
    setF1Ubicacion(project.ubicacion ?? {});
    setF1TotalContratado(project.totalContratado?.toString() ?? "");
    setShowDateForm(false); setDateTitle(""); setDateValue(new Date().toISOString().slice(0, 10));
    // F2
    setF2Status(project.status ?? "en-programacion");
    setF2Estimacion(project.estimacion ?? "");
    setF2Cotizacion(project.cotizacion ?? "");
    setF2PaymentStatus(project.paymentStatus ?? "unpaid");
    setF2FechaSolicitud((project.fechaSolicitud ?? project.createdAt ?? "").slice(0, 10));
    setF2StartDate(project.startDate ?? "");
    setF2EndDate(project.endDate ?? "");
    setF2CommitmentDate(project.commitmentDate ?? "");
    setF2Fotos(project.fotos ?? false);
    setF2FotosStatus(project.fotosStatus ?? (project.fotos ? "si" : "no"));
    setF2EstimFileStatus(project.estimacionFileStatus ?? "no");
    setF2CotizFileStatus(project.cotizacionFileStatus ?? "no");
    setF2ReporteFileStatus(project.reporteFileStatus ?? "no");
    setF2OtrosFileStatus(project.otrosFileStatus ?? "no");
    setF2Reporte(project.reporte ?? false);
    setF2Autorizador(project.autorizador ?? "");
    setF2Comentarios(project.comentariosCampo ?? "");
    // F3
    setF3TotalSinIva(project.totalSinIva?.toString() ?? "");
    setF3Iva(project.iva?.toString() ?? "");
    setF3Materiales(project.costoMateriales?.toString() ?? "");
    setF3Servicios(project.costoServicios?.toString() ?? "");
    setF3Personal(project.costoPersonal?.toString() ?? "");
    setF3SvoContratado(project.costoSvoContratado?.toString() ?? "");
    setF3Comision(project.costoComision?.toString() ?? "");
    setF3OtrosGastos(project.costoOtros?.toString() ?? "");
    setF3Oapc(project.oapc?.toString() ?? "");
    setF3Egpc(project.egpc?.toString() ?? "");
    setF3Luna(project.luna?.toString() ?? "");
    setF3PagoPadillas(project.pagoPadillas ?? true);
    setF3EstatusTrabajo(project.estatusPagoTrabajo ?? "Pendiente");
    setF3EstatusAlberto(project.estatusPagoAlberto ?? "Pendiente");
    setF3EstatusLuna(project.estatusPagoLuna ?? "Pendiente");
    setF3ComentariosDireccion(project.comentariosDireccion ?? "");
    // F4
    setPagoDrafts(
      project.pagosProyecto && project.pagosProyecto.length > 0
        ? project.pagosProyecto.map(pagoDraftFromSaved)
        : [createEmptyPago(1)],
    );
    setF4EstatusFinal(project.estatusPagoFinal ?? "Pendiente");
    // Expense form
    setShowExpenseForm(false);
    setExpTitulo(""); setExpMonto(""); setExpTipo("material"); setExpCategoria("material");
    setExpFecha(new Date().toISOString().slice(0, 10));
    // Invoice form
    setShowInvoiceForm(false);
    setInvOc(""); setInvSubtotal(""); setInvFacturarA(""); setInvMdp("PPD");
    setInvFechaSolicitud(new Date().toISOString().slice(0, 10));
    // Chat + Archivos
    setMessage("");
    setIsPriority(false);
    closeGallery();
    setUploadError(null);
    // Limpiar mensajes al cambiar de proyecto
    setChatMessages([]);
  }, [project?.id]);

  // Sincroniza los campos F1 cuando el proyecto cambia externamente via polling (mismo project.id, datos nuevos).
  // Cubre todos los campos de Apertura que el ingeniero puede editar: cliente, departamento, lugar,
  // tipo, urgencia, ingeniero asignado, negociador, contacto, nombre, descripción, ubicación, monto.
  useEffect(() => {
    if (!project) return;
    setF1Client(project.client ?? "");
    setF1Department(project.department ?? "");
    setF1Lugar(project.lugar ?? "");
    setF1Type(project.type ?? "INST");
    setF1Urgencia(PRIORITY_TO_URGENCIA[project.priority] ?? "Medio");
    setF1EngineerId(
      engineerUsers.find(
        (u) => u.id === project.createdBy || project.participants.includes(u.id),
      )?.id ?? "",
    );
    setF1Negociador(project.negociador ?? "");
    setF1ContactUser(project.usuarioContacto ?? "");
    setF1BaseName(project.baseName ?? "");
    setF1Description(project.description ?? "");
    setF1Ubicacion(project.ubicacion ?? {});
    setF1TotalContratado(project.totalContratado?.toString() ?? "");
  }, [
    project?.client,
    project?.department,
    project?.lugar,
    project?.type,
    project?.priority,
    project?.createdBy,
    // participants es array — serializar para que React detecte cambios de referencia
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(project?.participants),
    project?.negociador,
    project?.usuarioContacto,
    project?.baseName,
    project?.description,
    // ubicacion es objeto — serializar igual
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(project?.ubicacion),
    project?.totalContratado,
  ]);

  // Sincroniza los campos F2 cuando el proyecto cambia externamente via polling (mismo project.id, datos nuevos).
  // Cubre: fechas, estados, fotos, reporte, autorizador y comentarios.
  // No toca campos que el usuario podría estar editando ahora mismo en otro formulario.
  useEffect(() => {
    if (!project) return;
    setF2Status(project.status ?? "en-programacion");
    setF2Estimacion(project.estimacion ?? "");
    setF2Cotizacion(project.cotizacion ?? "");
    setF2PaymentStatus(project.paymentStatus ?? "unpaid");
    setF2StartDate(project.startDate ?? "");
    setF2EndDate(project.endDate ?? "");
    setF2CommitmentDate(project.commitmentDate ?? "");
    setF2Fotos(project.fotos ?? false);
    setF2Reporte(project.reporte ?? false);
    setF2Autorizador(project.autorizador ?? "");
    setF2Comentarios(project.comentariosCampo ?? "");
  }, [
    project?.status,
    project?.estimacion,
    project?.cotizacion,
    project?.paymentStatus,
    project?.startDate,
    project?.endDate,
    project?.commitmentDate,
    project?.fotos,
    project?.reporte,
    project?.autorizador,
    project?.comentariosCampo,
  ]);

  // Sincroniza los campos F3 (Financiero) cuando el proyecto cambia externamente via polling.
  // Solo visible para admin y gestor (canEditBudget). Cubre costos, estatus de pago internos y comentarios.
  useEffect(() => {
    if (!project) return;
    setF3TotalSinIva(project.totalSinIva?.toString() ?? "");
    setF3Iva(project.iva?.toString() ?? "");
    setF3Materiales(project.costoMateriales?.toString() ?? "");
    setF3Servicios(project.costoServicios?.toString() ?? "");
    setF3Personal(project.costoPersonal?.toString() ?? "");
    setF3SvoContratado(project.costoSvoContratado?.toString() ?? "");
    setF3Comision(project.costoComision?.toString() ?? "");
    setF3OtrosGastos(project.costoOtros?.toString() ?? "");
    setF3Oapc(project.oapc?.toString() ?? "");
    setF3Egpc(project.egpc?.toString() ?? "");
    setF3Luna(project.luna?.toString() ?? "");
    setF3PagoPadillas(project.pagoPadillas ?? true);
    setF3EstatusTrabajo(project.estatusPagoTrabajo ?? "Pendiente");
    setF3EstatusAlberto(project.estatusPagoAlberto ?? "Pendiente");
    setF3EstatusLuna(project.estatusPagoLuna ?? "Pendiente");
    setF3ComentariosDireccion(project.comentariosDireccion ?? "");
  }, [
    project?.totalSinIva,
    project?.iva,
    project?.costoMateriales,
    project?.costoServicios,
    project?.costoPersonal,
    project?.costoSvoContratado,
    project?.costoComision,
    project?.costoOtros,
    project?.oapc,
    project?.egpc,
    project?.luna,
    project?.pagoPadillas,
    project?.estatusPagoTrabajo,
    project?.estatusPagoAlberto,
    project?.estatusPagoLuna,
    project?.comentariosDireccion,
  ]);

  // Sincroniza los campos F4 (Pagos) cuando el proyecto cambia externamente via polling.
  // Solo visible para admin y gestor. pagosProyecto es array — se serializa para detectar cambios.
  useEffect(() => {
    if (!project) return;
    setPagoDrafts(
      project.pagosProyecto && project.pagosProyecto.length > 0
        ? project.pagosProyecto.map(pagoDraftFromSaved)
        : [createEmptyPago(1)],
    );
    setF4EstatusFinal(project.estatusPagoFinal ?? "Pendiente");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(project?.pagosProyecto), project?.estatusPagoFinal]);

  // Sincroniza los badges de archivo cuando cambian externamente (aprobación admin, realtime polling)
  // Solo actualiza estos campos read-only; no toca el resto del formulario para no interrumpir edición en curso
  useEffect(() => {
    if (!project) return;
    setF2FotosStatus(project.fotosStatus ?? (project.fotos ? "si" : "no"));
    setF2EstimFileStatus(project.estimacionFileStatus ?? "no");
    setF2CotizFileStatus(project.cotizacionFileStatus ?? "no");
    setF2ReporteFileStatus(project.reporteFileStatus ?? "no");
    setF2OtrosFileStatus(project.otrosFileStatus ?? "no");
  }, [
    project?.fotosStatus,
    project?.estimacionFileStatus,
    project?.cotizacionFileStatus,
    project?.reporteFileStatus,
    project?.otrosFileStatus,
    project?.fotos,
  ]);

  // ── Cargar mensajes al abrir + suscribir al polling ──────────
  useEffect(() => {
    if (!open || !project) return;

    realtime.setProject(project.id);

    // Carga inicial del historial
    setChatLoading(true);
    realtime.loadMessages(project.id)
      .then(msgs => setChatMessages(msgs))
      .catch(() => undefined)
      .finally(() => setChatLoading(false));

    // Suscribirse a mensajes nuevos via polling
    const unsub = realtime.onMessages((newMsgs) => {
      setChatMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const fresh = newMsgs.filter(m => !existingIds.has(m.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
    });

    return () => {
      unsub();
      realtime.setProject(null);
    };
  }, [open, project?.id]);

  // ── Auto-scroll al fondo cuando llegan mensajes nuevos ───────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length]);

  if (!project) return null;

  // ── Handler de envío de mensaje de chat ──────────────────────
  const handleSendChatMessage = async (): Promise<void> => {
    if (!message.trim() || chatSending) return;
    const text = message.trim();
    const priority = isPriority;
    setMessage("");
    setIsPriority(false);
    setChatSending(true);
    try {
      const sent = await realtime.sendMessage(project.id, text, priority);
      if (sent) {
        setChatMessages(prev => {
          if (prev.some(m => m.id === sent.id)) return prev;
          return [...prev, sent];
        });
        onMessageSent?.(project.id, currentUser.id, currentUser.name, text, priority);
      }
    } catch {
      // Reestablecer el mensaje si falló
      setMessage(text);
    } finally {
      setChatSending(false);
    }
  };

  // ── Handlers de guardado ──
  const handleSaveF1 = async (): Promise<void> => {
    setSavingF1(true);
    try {
      await onUpdateProject(project.id, {
        client: f1Client,
        department: f1Department,
        lugar: f1Lugar || undefined,
        type: f1Type,
        priority: URGENCIA_TO_PRIORITY[f1Urgencia] ?? "medium",
        negociador: f1Negociador || undefined,
        usuarioContacto: f1ContactUser || undefined,
        baseName: f1BaseName,
        description: f1Description,
        ubicacion: f1Ubicacion,
        totalContratado: n(f1TotalContratado) ?? project.totalContratado,
        assignedEngineerId: f1EngineerId || undefined,
      });
    } catch { /* error ya mostrado via toast en handleUpdateProject */ }
    finally { setSavingF1(false); }
  };

  const handleSaveF2 = async (): Promise<void> => {
    setSavingF2(true);
    try {
      await onUpdateProject(project.id, {
        status: f2Status,
        estimacion: (f2Estimacion as EstimacionStatus) || undefined,
        cotizacion: (f2Cotizacion as CotizacionStatus) || undefined,
        paymentStatus: f2PaymentStatus,
        startDate: f2StartDate || undefined,
        endDate: f2EndDate || undefined,
        commitmentDate: f2CommitmentDate || undefined,
        fotos: f2Fotos,
        fotosStatus: f2FotosStatus,
        reporte: f2Reporte,
        autorizador: f2Autorizador || undefined,
        comentariosCampo: f2Comentarios || undefined,
      });
    } catch { /* error ya mostrado via toast en handleUpdateProject */ }
    finally { setSavingF2(false); }
  };

  const handleSaveF3 = async (): Promise<void> => {
    setSavingF3(true);
    try {
      await onUpdateProject(project.id, {
        totalSinIva: n(f3TotalSinIva),
        iva: n(f3Iva),
        costoMateriales: n(f3Materiales),
        costoServicios: n(f3Servicios),
        costoPersonal: n(f3Personal),
        costoSvoContratado: n(f3SvoContratado),
        costoComision: n(f3Comision),
        costoOtros: n(f3OtrosGastos),
        oapc: n(f3Oapc),
        egpc: n(f3Egpc),
        luna: n(f3Luna),
        pagoPadillas: f3PagoPadillas,
        estatusPagoTrabajo: f3EstatusTrabajo,
        estatusPagoAlberto: f3EstatusAlberto,
        estatusPagoLuna: f3EstatusLuna,
        comentariosDireccion: f3ComentariosDireccion || undefined,
      });
    } catch { /* error ya mostrado via toast en handleUpdateProject */ }
    finally { setSavingF3(false); }
  };

  const handleSaveF4 = async (): Promise<void> => {
    setSavingF4(true);
    try {
      const pagos: PagoProyecto[] = pagoDrafts.map((d) => ({
        id: d.id,
        numeroPago: d.numeroPago,
        estado: d.estado,
        promesaPago: d.promesaPago || undefined,
        tipoPagoAbono: d.tipoPagoAbono,
        factura: d.factura || undefined,
        mdp: d.mdp,
        complementoPago: d.complementoPago || undefined,
        fechaPago: d.fechaPago || undefined,
        subtotalAbono: parseFloat(d.subtotalAbono) || 0,
        createdAt: d.createdAt,
      }));
      await onUpdateProject(project.id, {
        pagosProyecto: pagos,
        estatusPagoFinal: f4EstatusFinal,
      });
    } catch { /* error ya mostrado via toast en handleUpdateProject */ }
    finally { setSavingF4(false); }
  };

  const updatePagoDraft = (id: string, field: keyof PagoDraft, value: string): void => {
    setPagoDrafts((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const togglePagoEstado = (id: string): void => {
    setPagoDrafts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next = p.estado === "pendiente" ? "realizado" : "pendiente";
        return {
          ...p,
          estado: next,
          fechaPago: next === "realizado" && !p.fechaPago ? new Date().toISOString().slice(0, 10) : p.fechaPago,
        };
      }),
    );
  };

  const addPago = (): void => {
    setPagoDrafts((prev) => [...prev, createEmptyPago(prev.length + 1)]);
  };

  const removePago = (id: string): void => {
    setPagoDrafts((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      return filtered.map((p, i) => ({ ...p, numeroPago: i + 1 }));
    });
  };

  const infoTabs: { key: InfoTab; label: string; sublabel: string }[] = [
    { key: "f1", label: "F1", sublabel: "Apertura" },
    { key: "f2", label: "F2", sublabel: "Ejecución" },
    ...(canEditBudget ? [{ key: "f3" as InfoTab, label: "F3", sublabel: "Financiero" }] : []),
    ...(canEditBudget ? [{ key: "f4" as InfoTab, label: "F4", sublabel: "Pagos" }] : []),
  ];

  const ubicacionFields: { key: keyof UbicacionProyecto; label: string; placeholder: string }[] = [
    { key: "calle", label: "Calle", placeholder: "Nombre de calle" },
    { key: "planta", label: "Planta", placeholder: "Planta baja, 1er piso..." },
    { key: "edificio", label: "Edificio", placeholder: "Nombre o clave" },
    { key: "piso", label: "Piso", placeholder: "Número de piso" },
    { key: "puerta", label: "Puerta / Local", placeholder: "Puerta o local" },
    { key: "descripcion", label: "Descripción ubicación", placeholder: "Referencia adicional" },
  ];

  function SaveBtn({ onClick, label, saving }: { onClick: () => Promise<void> | void; label: string; saving?: boolean }): JSX.Element {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={saving}
        className="mt-1 w-full rounded-2xl border border-border-default bg-muted py-3.5 text-sm font-bold text-foreground transition hover:bg-border-default hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Guardando..." : label}
      </button>
    );
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={project.baseName}
      description={project.structuredName}
      className="max-w-3xl"
    >
      {/* Badges + progress */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind="project" value={project.status} />
          <StatusBadge kind="payment" value={project.paymentStatus} />
          <PriorityBadge priority={project.priority} />
          {canDeleteProject ? (
            <div className="relative ml-auto">
              <button
                type="button"
                onClick={() => setShowDeleteMenu((c) => !c)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border-default text-muted-foreground transition hover:bg-border-default hover:text-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {showDeleteMenu ? (
                <div className="absolute right-0 top-full z-20 mt-1.5 min-w-[172px] rounded-2xl border border-border-default bg-surface p-1.5 shadow-xl">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
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
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border-default">
          <div
            className="h-full rounded-full bg-accent transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Main tabs */}
      <Tabs
        value={mainTab}
        onValueChange={setMainTab}
        options={[
          { key: "info", label: "Info" },
          { key: "chat", label: "Chat", count: chatMessages.length || project.comments.length },
          { key: "archivos", label: "Archivos", count: project.files.length },
        ]}
      />

      {/* ══════════════════ INFO TAB ══════════════════ */}
      {mainTab === "info" ? (
        <div className="mt-4 space-y-4">
          {/* F-sub-tabs */}
          <div
            className="grid gap-1 rounded-2xl bg-surface p-1"
            style={{ gridTemplateColumns: `repeat(${infoTabs.length}, 1fr)` }}
          >
            {infoTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setInfoTab(tab.key)}
                className={`flex flex-col items-center rounded-xl px-1 py-2.5 text-center transition-all duration-200 ${
                  infoTab === tab.key ? "bg-muted shadow-sm" : "hover:bg-surface-elevated"
                }`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-[0.18em] ${infoTab === tab.key ? "text-muted-foreground" : "text-ink-tertiary"}`}>
                  {tab.label}
                </span>
                <span className={`text-sm font-bold ${infoTab === tab.key ? "text-foreground" : "text-ink-tertiary"}`}>
                  {tab.sublabel}
                </span>
              </button>
            ))}
          </div>

          {/* Leyenda y barra de código (comunes a todos los sub-tabs) */}
          {infoTab === "f1" ? (
            <p className="border-l-2 border-border-default pl-3 text-xs text-ink-tertiary">
              Ingeniero o Admin · <span className="text-info/70">Campos azules = ambos</span> · <span className="text-orange-400/70">Campos naranja = solo Admin</span>
            </p>
          ) : infoTab === "f2" ? (
            <p className="border-l-2 border-border-default pl-3 text-xs text-ink-tertiary">
              Ingeniero · Llena durante y después del trabajo en campo
            </p>
          ) : infoTab === "f3" ? (
            <p className="border-l-2 border-orange-400/40 pl-3 text-xs font-semibold text-orange-400/80">
              Solo Admin · Información financiera interna
            </p>
          ) : (
            <p className="border-l-2 border-orange-400/40 pl-3 text-xs font-semibold text-orange-400/80">
              Solo Admin · Registro de pagos recibidos
            </p>
          )}

          {/* Barra de código */}
          <div className="rounded-xl border border-info/40 bg-info/10 px-4 py-2.5">
            <p className="font-mono text-sm font-bold tracking-wide text-info">
              {project.structuredName}
            </p>
          </div>

          {/* ────────── F1 APERTURA ────────── */}
          {infoTab === "f1" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Consecutivo + fecha solicitud */}
                <div className={FLD}>
                  <label className={LBL}>No. Consecutivo 🔒</label>
                  <div className={`${INP_RO} flex items-center gap-2`}>
                    <span className="font-mono font-black text-foreground">{consecutivo}</span>
                    {(project.fechaSolicitud ?? project.createdAt) ? (
                      <>
                        <span className="text-border-default">·</span>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {parseLocalDate(project.fechaSolicitud ?? project.createdAt!).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                {/* Cliente */}
                <div className={FLD}>
                  <label className={LBL}>1 · Cliente</label>
                  <input
                    list="cl-list"
                    className={INP}
                    value={f1Client}
                    onChange={(e) => setF1Client(e.target.value)}
                    placeholder="— Seleccionar"
                    disabled={!canEditProject}
                  />
                  <datalist id="cl-list">
                    {clientOptions.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                {/* Departamento */}
                <div className={FLD}>
                  <label className={LBL}>2 · Departamento</label>
                  <input
                    list="dp-list"
                    className={INP}
                    value={f1Department}
                    onChange={(e) => setF1Department(e.target.value)}
                    placeholder="— Seleccionar"
                    disabled={!canEditProject}
                  />
                  <datalist id="dp-list">
                    {departmentOptions.map((d) => <option key={d} value={d} />)}
                  </datalist>
                </div>
                {/* Lugar */}
                <div className={`${FLD} sm:col-span-2`}>
                  <label className={LBL}>3 · Lugar</label>
                  <input
                    className={INP}
                    value={f1Lugar}
                    onChange={(e) => setF1Lugar(e.target.value)}
                    placeholder="Ej. AULAS 2, Planta Norte, Edificio C..."
                    disabled={!canEditProject}
                  />
                </div>
                {/* Tipo */}
                <div className={FLD}>
                  <label className={LBL}>4 · Tipo de proyecto</label>
                  <select
                    className={INP}
                    value={f1Type}
                    onChange={(e) => setF1Type(e.target.value as ProjectType)}
                    disabled={!canEditProject}
                  >
                    <option value="">— Seleccionar</option>
                    {(Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]).map(
                      ([k, v]) => <option key={k} value={k}>{v}</option>,
                    )}
                  </select>
                </div>
                {/* Nombre del trabajo */}
                <div className={`${FLD} sm:col-span-2`}>
                  <label className={LBL}>5 · Nombre / Descripción del trabajo</label>
                  <input
                    className={INP}
                    value={f1BaseName}
                    onChange={(e) => setF1BaseName(e.target.value)}
                    placeholder="Ej. Medidor A4"
                    disabled={!canEditProject}
                  />
                </div>
                {/* Urgencia */}
                <div className={FLD}>
                  <label className={LBL}>7 · Urgencia</label>
                  <select
                    className={INP}
                    value={f1Urgencia}
                    onChange={(e) => setF1Urgencia(e.target.value)}
                    disabled={!canEditProject}
                  >
                    <option value="Bajo">Bajo</option>
                    <option value="Medio">Medio</option>
                    <option value="Alto">Alto</option>
                    <option value="Emergencia">Emergencia</option>
                  </select>
                </div>
                {/* Ingeniero asignado */}
                <div className={canManageProjectStatus ? FLD_ADM : FLD}>
                  {canManageProjectStatus
                    ? <LabelAdmin text="8 · Ingeniero asignado" />
                    : <label className={LBL}>8 · Ingeniero asignado</label>}
                  {canManageProjectStatus ? (
                    <select
                      className={INP}
                      value={f1EngineerId}
                      onChange={(e) => setF1EngineerId(e.target.value)}
                    >
                      <option value="">Sin asignar</option>
                      {engineerUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input className={INP_RO} value={assignedEngineer?.name ?? "Sin asignar"} readOnly />
                  )}
                </div>
              </div>

              {/* 9 · Ubicación */}
              <div>
                <p className={`${LBL} mb-2`}>9 · Ubicación del trabajo</p>
                <div className="grid gap-2.5 rounded-2xl bg-surface p-3 sm:grid-cols-2">
                  {ubicacionFields.map(({ key, label, placeholder }) => (
                    <div key={key} className={FLD}>
                      <label className={LBL}>{label}</label>
                      <input
                        className={INP}
                        value={f1Ubicacion[key] ?? ""}
                        onChange={(e) =>
                          setF1Ubicacion((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder={placeholder}
                        disabled={!canEditProject}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 10 · Negociador + 11 · Contacto */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className={FLD}>
                  <label className={LBL}>10 · Compras / Negociador</label>
                  <input
                    className={INP}
                    value={f1Negociador}
                    onChange={(e) => setF1Negociador(e.target.value)}
                    placeholder="N/A"
                    disabled={!canEditProject}
                  />
                </div>
                <div className={FLD}>
                  <label className={LBL}>11 · Usuario de contacto</label>
                  <input
                    className={INP}
                    value={f1ContactUser}
                    onChange={(e) => setF1ContactUser(e.target.value)}
                    placeholder="Contacto del cliente"
                    disabled={!canEditProject}
                  />
                </div>
              </div>

              {/* 12 · Monto contratado */}
              {canEditBudget ? (
                <div className={FLD_ADM}>
                  <LabelAdmin text="12 · Monto contratado" />
                  <input
                    type="number"
                    className={INP}
                    value={f1TotalContratado}
                    onChange={(e) => setF1TotalContratado(e.target.value)}
                    placeholder="0"
                  />
                </div>
              ) : project.totalContratado ? (
                <div className={FLD}>
                  <label className={LBL}>12 · Monto contratado</label>
                  <input className={INP_RO} value={mxn(project.totalContratado)} readOnly />
                </div>
              ) : null}

              {/* 13 · Fechas importantes */}
              <div className="rounded-2xl border border-border-default bg-surface p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    13 · Fechas importantes
                  </p>
                  {onAddProjectImportantDate ? (
                    <button
                      type="button"
                      onClick={() => setShowDateForm((v) => !v)}
                      className="flex items-center gap-1 rounded-xl bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent ring-1 ring-accent/20 transition hover:bg-accent/20"
                    >
                      <Plus className="h-3 w-3" />
                      {showDateForm ? "Cancelar" : "Agregar"}
                    </button>
                  ) : null}
                </div>

                {showDateForm && onAddProjectImportantDate ? (
                  <div className="mb-3 space-y-2.5 rounded-xl border border-border-default bg-surface-elevated p-3">
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div className={FLD}>
                        <label className={LBL}>Título</label>
                        <input className={INP} value={dateTitle} onChange={(e) => setDateTitle(e.target.value)} placeholder="Ej: Entrega de estimación" />
                      </div>
                      <div className={FLD}>
                        <label className={LBL}>Fecha</label>
                        <DatePickerMX value={dateValue} onChange={setDateValue} />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!dateTitle.trim() || !dateValue}
                      onClick={() => {
                        onAddProjectImportantDate(project.id, { title: dateTitle.trim(), date: dateValue });
                        setDateTitle(""); setDateValue(new Date().toISOString().slice(0, 10));
                        setShowDateForm(false);
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent/15 py-2.5 text-sm font-bold text-accent ring-1 ring-accent/20 transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Guardar fecha
                    </button>
                  </div>
                ) : null}

                {(project.importantDates ?? []).length === 0 ? (
                  <p className="py-2 text-center text-xs text-ink-tertiary">Sin fechas registradas</p>
                ) : (
                  <div className="space-y-1.5">
                    {[...(project.importantDates ?? [])].sort((a, b) => a.date.localeCompare(b.date)).map((d) => {
                      const daysLeft = Math.round((new Date(`${d.date}T00:00:00`).getTime() - Date.now()) / 86400000);
                      const isOverdue = daysLeft < 0;
                      const isNear = daysLeft >= 0 && daysLeft <= 3;
                      return (
                        <div key={d.id} className={`flex items-center justify-between rounded-xl px-3 py-2 ${isOverdue ? "bg-danger/10 ring-1 ring-danger/20" : isNear ? "bg-brand/10 ring-1 ring-brand/20" : "bg-surface-elevated"}`}>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{d.title}</p>
                            <p className="text-xs text-ink-tertiary">{d.date}</p>
                          </div>
                          <span className={`ml-3 shrink-0 text-xs font-bold tabular-nums ${isOverdue ? "text-danger" : isNear ? "text-brand" : "text-ink-tertiary"}`}>
                            {isOverdue ? `${Math.abs(daysLeft)}d atrás` : daysLeft === 0 ? "hoy" : `en ${daysLeft}d`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {canEditProject ? <SaveBtn onClick={handleSaveF1} label="Guardar apertura" saving={savingF1} /> : null}
            </div>
          ) : null}

          {/* ────────── F2 EJECUCIÓN ────────── */}
          {infoTab === "f2" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className={FLD}>
                  <label className={LBL}>Estado del proyecto</label>
                  <select className={INP} value={f2Status} onChange={(e) => setF2Status(e.target.value as ProjectStatus)} disabled={!canEditProject}>
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className={FLD}>
                  <label className={LBL}>Estado estimación</label>
                  <select className={INP} value={f2Estimacion} onChange={(e) => setF2Estimacion(e.target.value as EstimacionStatus)} disabled={!canEditProject}>
                    <option value="">— Sin definir</option>
                    {ESTIMACION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className={FLD}>
                  <label className={LBL}>Estado cotización</label>
                  <select className={INP} value={f2Cotizacion} onChange={(e) => setF2Cotizacion(e.target.value as CotizacionStatus)} disabled={!canEditProject}>
                    <option value="">— Sin definir</option>
                    {COTIZACION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className={FLD}>
                  <label className={LBL}>Estado pago</label>
                  <select
                    className={INP}
                    value={f2PaymentStatus}
                    disabled={!canEditProject}
                    onChange={(e) => {
                      const next = e.target.value as PaymentStatus;
                      setF2PaymentStatus(next);
                      if (project && next !== project.paymentStatus) {
                        onUpdateProject(project.id, { paymentStatus: next });
                      }
                    }}
                  >
                    <option value="">— Sin definir</option>
                    <option value="unpaid">No pagado</option>
                    <option value="partial">Pago parcial</option>
                    <option value="paid">Pagado</option>
                  </select>
                </div>
                <div className={FLD}>
                  <label className={LBL}>F. Solicitud 🔒</label>
                  <div className={`${INP_RO} flex items-center`}>
                    {f2FechaSolicitud ? fmtHint(f2FechaSolicitud) : <span className="text-ink-tertiary">Sin fecha</span>}
                  </div>
                </div>
                <div className={FLD}>
                  <label className={LBL}>F. Inicio</label>
                  {canEditProject ? (
                    <DatePickerMX value={f2StartDate} onChange={setF2StartDate} />
                  ) : (
                    <div className={`${INP_RO} flex items-center`}>
                      {f2StartDate ? fmtHint(f2StartDate) : <span className="text-ink-tertiary">Sin fecha</span>}
                    </div>
                  )}
                </div>
                <div className={FLD}>
                  <label className={LBL}>F. Fin ★</label>
                  {canEditProject ? (
                    <DatePickerMX value={f2EndDate} onChange={setF2EndDate} />
                  ) : (
                    <div className={`${INP_RO} flex items-center`}>
                      {f2EndDate ? fmtHint(f2EndDate) : <span className="text-ink-tertiary">Sin fecha</span>}
                    </div>
                  )}
                </div>
                <div className={FLD}>
                  <label className={LBL}>F. Compromiso</label>
                  {canEditProject ? (
                    <DatePickerMX value={f2CommitmentDate} onChange={setF2CommitmentDate} />
                  ) : (
                    <div className={`${INP_RO} flex items-center`}>
                      {f2CommitmentDate ? fmtHint(f2CommitmentDate) : <span className="text-ink-tertiary">Sin fecha</span>}
                    </div>
                  )}
                </div>
                <div className={FLD}>
                  <label className={LBL}>Fotos de evidencia</label>
                  <div className={`${INP_RO} flex items-center`}>
                    {f2FotosStatus === "no" && <span>No</span>}
                    {f2FotosStatus === "en-revision" && <span className="text-brand">En revisión</span>}
                    {f2FotosStatus === "si" && <span className="text-success">Si</span>}
                    {f2FotosStatus === "rechazado" && <span className="text-danger">Rechazado</span>}
                  </div>
                </div>
                <div className={FLD}>
                  <label className={LBL}>Reporte generado</label>
                  <div className={`${INP_RO} flex items-center`}>
                    {f2ReporteFileStatus === "no" && <span>No</span>}
                    {f2ReporteFileStatus === "en-revision" && <span className="text-brand">En revisión</span>}
                    {f2ReporteFileStatus === "si" && <span className="text-success">Si</span>}
                    {f2ReporteFileStatus === "rechazado" && <span className="text-danger">Rechazado</span>}
                  </div>
                </div>
              </div>

              {/* Autorizador — solo Admin */}
              <div className={FLD_ADM}>
                <LabelAdmin text="Autorizador" />
                {canManageProjectStatus ? (
                  <input className={INP} value={f2Autorizador} onChange={(e) => setF2Autorizador(e.target.value)} placeholder="Nombre del autorizador" />
                ) : (
                  <input className={INP_RO} value={project.autorizador ?? "—"} readOnly />
                )}
              </div>

              {/* Comentarios del campo */}
              <div className={FLD}>
                <label className={LBL}>Comentarios del campo</label>
                <textarea
                  className={`${INP} h-auto min-h-[90px] resize-none py-2.5`}
                  value={f2Comentarios}
                  onChange={(e) => setF2Comentarios(e.target.value)}
                  placeholder="Notas del ingeniero sobre el trabajo realizado..."
                  disabled={!canEditProject}
                  rows={3}
                />
              </div>

              {canEditProject ? <SaveBtn onClick={handleSaveF2} label="Guardar ejecución" saving={savingF2} /> : null}
            </div>
          ) : null}

          {/* ────────── F3 FINANCIERO ────────── */}
          {infoTab === "f3" && canEditBudget ? (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-surface p-3 text-center">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Total S/IVA</p>
                  <p className="text-base font-black tabular-nums text-foreground">{mxn(parseFloat(f3TotalSinIva) || 0)}</p>
                </div>
                <div className="rounded-2xl bg-surface p-3 text-center">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Ganancia</p>
                  <p className={`text-base font-black tabular-nums ${ganancia >= 0 ? "text-accent" : "text-danger"}`}>{mxn(ganancia)}</p>
                </div>
                <div className="rounded-2xl bg-surface p-3 text-center">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Por cobrar</p>
                  <p className={`text-base font-black tabular-nums ${porCobrar <= 0 ? "text-accent" : "text-brand"}`}>{mxn(porCobrar)}</p>
                </div>
              </div>

              {/* Total + IVA */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className={FLD_ADM}>
                  <LabelAdmin text="Total sin IVA" />
                  <input
                    type="number"
                    className={INP}
                    value={f3TotalSinIva}
                    onChange={(e) => {
                      const v = e.target.value;
                      setF3TotalSinIva(v);
                      setF3Iva((parseFloat(v) || 0) * 0.16 ? String(((parseFloat(v) || 0) * 0.16).toFixed(2)) : "");
                    }}
                    placeholder="0"
                  />
                </div>
                <div className={FLD_ADM}>
                  <LabelAuto text="IVA (16%)" />
                  <input
                    type="number"
                    className={INP_RO}
                    value={f3Iva}
                    readOnly
                    tabIndex={-1}
                    placeholder="Calculado automático"
                  />
                </div>
              </div>

              {/* Desglose de costos */}
              <div className="rounded-2xl bg-surface p-3">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Desglose de costos
                </p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {[
                    { label: "Materiales", val: f3Materiales, set: setF3Materiales },
                    { label: "Servicios", val: f3Servicios, set: setF3Servicios },
                    { label: "Personal", val: f3Personal, set: setF3Personal },
                    { label: "Svo. Contratado", val: f3SvoContratado, set: setF3SvoContratado },
                    { label: "Comisión", val: f3Comision, set: setF3Comision },
                    { label: "Otros gastos", val: f3OtrosGastos, set: setF3OtrosGastos },
                  ].map(({ label, val, set }) => (
                    <div key={label} className={FLD_ADM}>
                      <LabelAdmin text={label} />
                      <input type="number" className={INP} value={val} onChange={(e) => set(e.target.value)} placeholder="0" />
                    </div>
                  ))}
                </div>

                {/* Calculados automáticos */}
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded-xl border border-success/20 bg-success/10 p-3">
                    <LabelAuto text="Ganancia" />
                    <p className={`mt-1 text-base font-black tabular-nums ${ganancia >= 0 ? "text-success" : "text-danger"}`}>
                      {mxn(ganancia)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-success/20 bg-success/10 p-3">
                    <LabelAuto text="Por cobrar" />
                    <p className={`mt-1 text-base font-black tabular-nums ${porCobrar <= 0 ? "text-success" : "text-foreground"}`}>
                      {mxn(porCobrar)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Comentarios dirección */}
              <div className={FLD_ADM}>
                <LabelAdmin text="Comentarios dirección" />
                <textarea
                  className={`${INP} h-auto min-h-[80px] resize-none py-2.5`}
                  value={f3ComentariosDireccion}
                  onChange={(e) => setF3ComentariosDireccion(e.target.value)}
                  placeholder="Notas internas..."
                  rows={3}
                />
              </div>

              {/* ── Gastos de campo ── */}
              <div className="rounded-2xl border border-border-default bg-surface p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Gastos de campo
                    {(project.expenses ?? []).length > 0 && (
                      <span className="ml-2 font-black tabular-nums text-accent">
                        {mxn((project.expenses ?? []).reduce((s, e) => s + e.monto, 0))}
                      </span>
                    )}
                  </p>
                  {onAddExpense ? (
                    <button
                      type="button"
                      onClick={() => setShowExpenseForm((v) => !v)}
                      className="flex items-center gap-1 rounded-xl bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent ring-1 ring-accent/20 transition hover:bg-accent/20"
                    >
                      <Plus className="h-3 w-3" />
                      {showExpenseForm ? "Cancelar" : "Agregar"}
                    </button>
                  ) : null}
                </div>

                {showExpenseForm && onAddExpense ? (
                  <div className="mb-3 space-y-2.5 rounded-xl border border-border-default bg-surface-elevated p-3">
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div className={FLD}>
                        <label className={LBL}>Título</label>
                        <input className={INP} value={expTitulo} onChange={(e) => setExpTitulo(e.target.value)} placeholder="Descripción del gasto" />
                      </div>
                      <div className={FLD}>
                        <label className={LBL}>Monto</label>
                        <input type="number" className={INP} value={expMonto} onChange={(e) => setExpMonto(e.target.value)} placeholder="0" />
                      </div>
                      <div className={FLD}>
                        <label className={LBL}>Tipo</label>
                        <select className={INP} value={expTipo} onChange={(e) => setExpTipo(e.target.value as ExpenseType)}>
                          <option value="material">Material</option>
                          <option value="personal">Personal</option>
                        </select>
                      </div>
                      <div className={FLD}>
                        <label className={LBL}>Categoría</label>
                        <select className={INP} value={expCategoria} onChange={(e) => setExpCategoria(e.target.value as ExpenseCategory)}>
                          <option value="material">Material</option>
                          <option value="herramienta">Herramienta</option>
                          <option value="transporte">Transporte</option>
                          <option value="servicio">Servicio</option>
                          <option value="sueldo">Sueldo</option>
                          <option value="horas_extras">Horas extras</option>
                          <option value="viaticos">Viáticos</option>
                          <option value="bono">Bono</option>
                        </select>
                      </div>
                      <div className={`${FLD} sm:col-span-2`}>
                        <label className={LBL}>Fecha</label>
                        <DatePickerMX value={expFecha} onChange={setExpFecha} />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!expTitulo.trim() || !expMonto || !expFecha}
                      onClick={() => {
                        onAddExpense(project.id, {
                          titulo: expTitulo.trim(),
                          descripcion: "",
                          monto: parseFloat(expMonto) || 0,
                          tipo: expTipo,
                          categoria: expCategoria,
                          fecha: expFecha,
                          imagenes: [],
                        });
                        setExpTitulo(""); setExpMonto(""); setExpFecha(new Date().toISOString().slice(0, 10));
                        setShowExpenseForm(false);
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent/15 py-2.5 text-sm font-bold text-accent ring-1 ring-accent/20 transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Guardar gasto
                    </button>
                  </div>
                ) : null}

                {(project.expenses ?? []).length === 0 ? (
                  <p className="py-2 text-center text-xs text-ink-tertiary">Sin gastos registrados</p>
                ) : (
                  <div className="space-y-1.5">
                    {[...(project.expenses ?? [])].reverse().map((exp) => (
                      <div key={exp.id} className="flex items-center justify-between rounded-xl bg-surface-elevated px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{exp.titulo}</p>
                          <p className="text-xs text-ink-tertiary">{exp.categoria} · {exp.fecha}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 pl-3">
                          <span className="text-sm font-bold tabular-nums text-accent">{mxn(exp.monto)}</span>
                          {onDeleteExpense ? (
                            <button
                              type="button"
                              onClick={() => onDeleteExpense(project.id, exp.id)}
                              className="rounded-lg p-1 text-ink-tertiary transition hover:text-danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <SaveBtn onClick={handleSaveF3} label="Guardar financiero" saving={savingF3} />
            </div>
          ) : null}

          {/* ────────── F4 PAGOS ────────── */}
          {infoTab === "f4" && canEditBudget ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-surface p-3 text-center">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Total</p>
                  <p className="text-base font-black tabular-nums text-foreground">{mxn(project.totalSinIva)}</p>
                </div>
                <div className="rounded-2xl bg-surface p-3 text-center">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Abono total</p>
                  <p className="text-base font-black tabular-nums text-accent">{mxn(abonoTotal)}</p>
                </div>
                <div className="rounded-2xl bg-surface p-3 text-center">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Por cobrar</p>
                  <p className={`text-base font-black tabular-nums ${porCobrar <= 0 ? "text-accent" : "text-brand"}`}>{mxn(porCobrar)}</p>
                </div>
              </div>

              {/* Bloques de pago */}
              <div className="space-y-3">
                {pagoDrafts.map((pago) => {
                  const isRealizado = pago.estado === "realizado";
                  const fechaLabel = pago.fechaPago
                    ? parseLocalDate(pago.fechaPago).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
                    : null;
                  return (
                    <div
                      key={pago.id}
                      className={`rounded-2xl border p-4 transition-colors ${
                        isRealizado ? "border-success/30 bg-success/10" : "border-border-default bg-surface"
                      }`}
                    >
                      {/* Header */}
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                            Pago {pago.numeroPago}
                          </span>
                          {isRealizado ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success ring-1 ring-success/25">
                              <Check className="h-2.5 w-2.5" />
                              Realizado
                            </span>
                          ) : (
                            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand ring-1 ring-brand/20">
                              Pendiente
                            </span>
                          )}
                        </div>
                        {pagoDrafts.length > 1 ? (
                          <button
                            type="button"
                            className="text-ink-tertiary transition-colors hover:text-danger"
                            onClick={() => removePago(pago.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>

                      {/* Campos mínimos siempre visibles */}
                      <div className="grid gap-2.5 sm:grid-cols-3">
                        <div className={FLD}>
                          <label className={LBL}>Promesa de pago</label>
                          <DatePickerMX value={pago.promesaPago} onChange={(v) => updatePagoDraft(pago.id, "promesaPago", v)} />
                        </div>
                        <div className={FLD}>
                          <label className={LBL}>Tipo</label>
                          <select className={INP} value={pago.tipoPagoAbono} onChange={(e) => updatePagoDraft(pago.id, "tipoPagoAbono", e.target.value)}>
                            <option value="PPD">PPD</option>
                            <option value="PUE">PUE</option>
                            <option value="Contado">Contado</option>
                          </select>
                        </div>
                        <div className={FLD}>
                          <label className={LBL}>{isRealizado ? "Subtotal abono" : "Monto esperado"}</label>
                          <input type="number" className={INP} value={pago.subtotalAbono} onChange={(e) => updatePagoDraft(pago.id, "subtotalAbono", e.target.value)} placeholder="0" />
                        </div>
                      </div>

                      {/* Campos adicionales — solo cuando realizado */}
                      {isRealizado ? (
                        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
                          <div className={FLD}>
                            <label className={LBL}>Factura</label>
                            <input className={INP} value={pago.factura} onChange={(e) => updatePagoDraft(pago.id, "factura", e.target.value)} placeholder="A-001" />
                          </div>
                          <div className={FLD}>
                            <label className={LBL}>MDP</label>
                            <select className={INP} value={pago.mdp} onChange={(e) => updatePagoDraft(pago.id, "mdp", e.target.value)}>
                              <option value="PPD">PPD</option>
                              <option value="PUE">PUE</option>
                            </select>
                          </div>
                          <div className={FLD}>
                            <label className={LBL}>Complemento pago</label>
                            <input className={INP} value={pago.complementoPago} onChange={(e) => updatePagoDraft(pago.id, "complementoPago", e.target.value)} placeholder="—" />
                          </div>
                          <div className={`${FLD} sm:col-span-3`}>
                            <label className={LBL}>Fecha de pago</label>
                            <DatePickerMX value={pago.fechaPago} onChange={(v) => updatePagoDraft(pago.id, "fechaPago", v)} />
                          </div>
                        </div>
                      ) : null}

                      {/* Botón de toggle estado */}
                      <button
                        type="button"
                        onClick={() => togglePagoEstado(pago.id)}
                        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition ${
                          isRealizado
                            ? "bg-muted text-muted-foreground hover:text-danger"
                            : "bg-success/20 text-success ring-1 ring-success/20 hover:bg-success/40"
                        }`}
                      >
                        {isRealizado ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            {fechaLabel ? `Pagado el ${fechaLabel}` : "Pagado"} · Deshacer
                          </>
                        ) : (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Marcar como pagado
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Agregar pago */}
              <button
                type="button"
                onClick={addPago}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border-default py-3 text-sm font-semibold text-muted-foreground transition hover:border-border-strong hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                Agregar pago
              </button>

              {/* Estatus pago final */}
              <div className={FLD_ADM}>
                <LabelAdmin text="Estatus pago final" />
                <select
                  className={INP}
                  value={f4EstatusFinal}
                  onChange={(e) => setF4EstatusFinal(e.target.value as "Pendiente" | "Pagado")}
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="Pagado">Pagado</option>
                </select>
              </div>

              {/* ── Facturas ── */}
              {(canManageInvoices || (project.invoices ?? []).length > 0) ? (
                <div className="rounded-2xl border border-border-default bg-surface p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Facturas</p>
                    {canManageInvoices && onAddInvoice ? (
                      <button
                        type="button"
                        onClick={() => setShowInvoiceForm((v) => !v)}
                        className="flex items-center gap-1 rounded-xl bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent ring-1 ring-accent/20 transition hover:bg-accent/20"
                      >
                        <Plus className="h-3 w-3" />
                        {showInvoiceForm ? "Cancelar" : "Nueva factura"}
                      </button>
                    ) : null}
                  </div>

                  {showInvoiceForm && canManageInvoices && onAddInvoice ? (
                    <div className="mb-3 space-y-2.5 rounded-xl border border-border-default bg-surface-elevated p-3">
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div className={FLD}>
                          <label className={LBL}>OC</label>
                          <input className={INP} value={invOc} onChange={(e) => setInvOc(e.target.value)} placeholder="Orden de compra" />
                        </div>
                        <div className={FLD}>
                          <label className={LBL}>Subtotal</label>
                          <input type="number" className={INP} value={invSubtotal} onChange={(e) => setInvSubtotal(e.target.value)} placeholder="0" />
                        </div>
                        <div className={FLD}>
                          <label className={LBL}>Facturar a</label>
                          <input className={INP} value={invFacturarA} onChange={(e) => setInvFacturarA(e.target.value)} placeholder="Razón social" />
                        </div>
                        <div className={FLD}>
                          <label className={LBL}>MDP</label>
                          <select className={INP} value={invMdp} onChange={(e) => setInvMdp(e.target.value as MDP)}>
                            <option value="PPD">PPD</option>
                            <option value="PUE">PUE</option>
                          </select>
                        </div>
                        <div className={`${FLD} sm:col-span-2`}>
                          <label className={LBL}>Fecha solicitud</label>
                          <DatePickerMX value={invFechaSolicitud} onChange={setInvFechaSolicitud} />
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!invOc.trim() || !invSubtotal || !invFacturarA.trim()}
                        onClick={() => {
                          onAddInvoice(project.id, {
                            fechaSolicitud: invFechaSolicitud,
                            oc: invOc.trim(),
                            subtotal: parseFloat(invSubtotal) || 0,
                            facturarA: invFacturarA.trim(),
                            status: "solicitada",
                            mdp: invMdp,
                            complementoPago: "",
                          });
                          setInvOc(""); setInvSubtotal(""); setInvFacturarA("");
                          setShowInvoiceForm(false);
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent/15 py-2.5 text-sm font-bold text-accent ring-1 ring-accent/20 transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Crear factura
                      </button>
                    </div>
                  ) : null}

                  {(project.invoices ?? []).length === 0 ? (
                    <p className="py-2 text-center text-xs text-ink-tertiary">Sin facturas registradas</p>
                  ) : (
                    <div className="space-y-2">
                      {(project.invoices ?? []).map((inv) => {
                        const STATUS_COLORS: Record<InvoiceStatus, string> = {
                          solicitada: "text-brand bg-brand/10 ring-brand/20",
                          recibida:   "text-blue-400 bg-blue-400/10 ring-blue-400/20",
                          "en-portal":"text-violet-400 bg-violet-400/10 ring-violet-400/20",
                          enviada:    "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20",
                          pagada:     "text-success bg-success/10 ring-success/20",
                          cancelada:  "text-danger bg-danger/10 ring-danger/20",
                        };
                        const STATUS_NEXT: Partial<Record<InvoiceStatus, InvoiceStatus>> = {
                          solicitada: "recibida", recibida: "en-portal",
                          "en-portal": "enviada", enviada: "pagada",
                        };
                        const STATUS_LABELS: Record<InvoiceStatus, string> = {
                          solicitada: "Solicitada", recibida: "Recibida", "en-portal": "En portal",
                          enviada: "Enviada", pagada: "Pagada", cancelada: "Cancelada",
                        };
                        return (
                          <div key={inv.id} className="rounded-xl bg-surface-elevated p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-foreground">OC: {inv.oc}</p>
                                <p className="text-xs text-ink-tertiary">{inv.facturarA} · {mxn(inv.subtotal)}</p>
                                {inv.factura ? <p className="mt-0.5 text-xs text-ink-tertiary">Factura: {inv.factura}</p> : null}
                                {inv.fechaPago ? <p className="mt-0.5 text-xs text-success">Pagado: {inv.fechaPago}</p> : null}
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${STATUS_COLORS[inv.status]}`}>
                                {STATUS_LABELS[inv.status]}
                              </span>
                            </div>
                            {canManageInvoices && onUpdateInvoice && STATUS_NEXT[inv.status] ? (
                              <button
                                type="button"
                                onClick={() => onUpdateInvoice(project.id, inv.id, { status: STATUS_NEXT[inv.status]! })}
                                className="mt-2 w-full rounded-lg bg-white/5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                              >
                                Avanzar → {STATUS_LABELS[STATUS_NEXT[inv.status]!]}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              <SaveBtn onClick={handleSaveF4} label="Guardar pagos" saving={savingF4} />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ══════════════════ CHAT TAB ══════════════════ */}
      {mainTab === "chat" ? (
        <div className="mt-5 flex flex-col gap-3">
          {/* ── Historial de mensajes ── */}
          <div className="flex max-h-[340px] flex-col gap-2 overflow-y-auto rounded-[28px] bg-surface p-4 scroll-smooth">
            {chatLoading ? (
              <p className="py-6 text-center text-sm text-ink-tertiary">Cargando mensajes…</p>
            ) : chatMessages.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-tertiary">
                Sin mensajes todavía. Sé el primero.
              </p>
            ) : (
              chatMessages.map((msg) => {
                const isMine = msg.authorId === currentUser.id;
                return (
                  <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-[24px] px-4 py-3 text-sm shadow-soft ${
                        isMine ? "bg-accent text-brand-fg" : "bg-border-default text-foreground"
                      } ${msg.isPriority ? "ring-2 ring-danger/50" : ""}`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs font-semibold opacity-75">
                        <span>{msg.authorName}</span>
                        <span className="opacity-60">·</span>
                        <span className="opacity-60 capitalize">{msg.authorRole === "system_admin" ? "Gestor" : msg.authorRole}</span>
                        {msg.isPriority ? (
                          <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[10px] text-danger">
                            Prioritario
                          </span>
                        ) : null}
                      </div>
                      <p className="leading-relaxed">{msg.message}</p>
                      <p className="mt-1.5 text-[10px] opacity-50">{formatDate(msg.createdAt)}</p>
                    </div>
                  </div>
                );
              })
            )}
            {/* Ancla para auto-scroll al fondo */}
            <div ref={chatEndRef} />
          </div>

          {/* ── Input de nuevo mensaje ── */}
          <div className="rounded-[28px] bg-surface-elevated p-4">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                // Ctrl+Enter envía el mensaje
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && message.trim()) {
                  e.preventDefault();
                  void handleSendChatMessage();
                }
              }}
              placeholder="Escribe un mensaje… (Ctrl+Enter para enviar)"
              className={`${INP} h-auto min-h-[80px] resize-none py-2.5`}
              rows={3}
              disabled={chatSending}
            />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                <input
                  type="checkbox"
                  checked={isPriority}
                  onChange={(e) => setIsPriority(e.target.checked)}
                  className="h-4 w-4 accent-danger"
                />
                Marcar como prioritario
              </label>
              <button
                type="button"
                onClick={() => { void handleSendChatMessage(); }}
                disabled={!message.trim() || chatSending}
                className="inline-flex items-center gap-2 rounded-2xl bg-accent px-5 py-2.5 text-sm font-bold text-brand-fg transition hover:opacity-90 disabled:opacity-40"
              >
                <MessageCircleMore className="h-4 w-4" />
                {chatSending ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ══════════════════ ARCHIVOS TAB ══════════════════ */}
      {mainTab === "archivos" ? (() => {
        const DOCS_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";
        const REPORTE_ACCEPT = ".xls,.xlsx,.doc,.docx,.dwg,.dxf";
        const SECTION_MAX_MB: Record<FileCategory, number> = {
          fotos: 30, estimacion: 30, cotizacion: 30, reporte: 45, otros: 30,
        };
        const FILE_SECTIONS: { key: FileCategory; label: string; accept: string; onlyImages: boolean; maxMB: number }[] = [
          { key: "fotos",      label: "Fotos de evidencia", accept: "image/*",      onlyImages: true,  maxMB: 30 },
          { key: "estimacion", label: "Estimación",         accept: DOCS_ACCEPT,    onlyImages: false, maxMB: 30 },
          { key: "cotizacion", label: "Cotización",         accept: DOCS_ACCEPT,    onlyImages: false, maxMB: 30 },
          { key: "reporte",    label: "Reporte",            accept: REPORTE_ACCEPT, onlyImages: false, maxMB: 45 },
          { key: "otros",      label: "Otros",              accept: DOCS_ACCEPT,    onlyImages: false, maxMB: 30 },
        ];

        const getFileRef = (cat: FileCategory) => {
          if (cat === "fotos")      return fotosFileInputRef;
          if (cat === "estimacion") return estimacionFileInputRef;
          if (cat === "cotizacion") return cotizacionFileInputRef;
          if (cat === "reporte")    return reporteFileInputRef;
          return otrosFileInputRef;
        };

        const getSectionStatus = (cat: FileCategory): FileStatus => {
          if (cat === "fotos")      return f2FotosStatus;
          if (cat === "estimacion") return f2EstimFileStatus;
          if (cat === "cotizacion") return f2CotizFileStatus;
          if (cat === "reporte")    return f2ReporteFileStatus;
          return f2OtrosFileStatus;
        };
        const setSectionStatus = (cat: FileCategory, val: FileStatus): void => {
          if (cat === "fotos")           setF2FotosStatus(val);
          else if (cat === "estimacion") setF2EstimFileStatus(val);
          else if (cat === "cotizacion") setF2CotizFileStatus(val);
          else if (cat === "reporte")    setF2ReporteFileStatus(val);
          else                           setF2OtrosFileStatus(val);
        };
        const statusFieldOf = (cat: FileCategory): keyof ProjectItem => {
          if (cat === "fotos")      return "fotosStatus";
          if (cat === "estimacion") return "estimacionFileStatus";
          if (cat === "cotizacion") return "cotizacionFileStatus";
          if (cat === "reporte")    return "reporteFileStatus";
          return "otrosFileStatus";
        };

        const handleUpload = async (files: File[], category: FileCategory): Promise<void> => {
          if (!files.length || !onUploadFile) return;
          const maxMB = SECTION_MAX_MB[category];
          const oversized = files.find(f => f.size > maxMB * 1024 * 1024);
          if (oversized) { setUploadError(`"${oversized.name}" supera el límite de ${maxMB} MB.`); return; }
          setUploadError(null);
          setUploadingSection(category);
          try {
            for (const f of files) await onUploadFile(project.id, f, category);
            const cur = getSectionStatus(category);
            if (cur === "no" || cur === "rechazado") {
              setSectionStatus(category, "en-revision");
              onUpdateProject(project.id, { [statusFieldOf(category)]: "en-revision" });
            }
          } catch (err) {
            setUploadError(err instanceof Error ? err.message : "Error al subir");
          } finally {
            setUploadingSection(null);
          }
        };

        const handleDeleteFileInSection = async (fileId: string, category: FileCategory): Promise<void> => {
          if (!onDeleteFile) return;
          setDeletingFileId(fileId);
          try {
            await onDeleteFile(project.id, fileId, category);
            const remaining = filesBySection[category].filter(f => f.id !== fileId);
            if (remaining.length === 0) {
              setSectionStatus(category, "no");
            }
          } catch {
            // silently ignore — the file remains visible
          } finally {
            setDeletingFileId(null);
          }
        };

        const isEngineer = currentUser.role === "engineer";
        const canDeleteFiles = isEngineer || currentUser.role === "admin" || currentUser.role === "system_admin";

        return (
          <div className="mt-5 space-y-2.5">
            {/* Hidden inputs */}
            <input ref={fotosFileInputRef}      type="file" className="hidden" accept="image/*"                        multiple onChange={async (e) => { await handleUpload(Array.from(e.target.files ?? []), "fotos");      e.target.value = ""; }} />
            <input ref={estimacionFileInputRef} type="file" className="hidden" accept="*/*"                            multiple onChange={async (e) => { await handleUpload(Array.from(e.target.files ?? []), "estimacion"); e.target.value = ""; }} />
            <input ref={cotizacionFileInputRef} type="file" className="hidden" accept="*/*"                            multiple onChange={async (e) => { await handleUpload(Array.from(e.target.files ?? []), "cotizacion"); e.target.value = ""; }} />
            <input ref={reporteFileInputRef}    type="file" className="hidden" accept=".xls,.xlsx,.doc,.docx,.dwg,.dxf" multiple onChange={async (e) => { await handleUpload(Array.from(e.target.files ?? []), "reporte");    e.target.value = ""; }} />
            <input ref={otrosFileInputRef}      type="file" className="hidden" accept="*/*"                            multiple onChange={async (e) => { await handleUpload(Array.from(e.target.files ?? []), "otros");       e.target.value = ""; }} />
            <input ref={cameraInputRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await handleUpload([f], "fotos"); e.target.value = ""; }} />

            {uploadError ? (
              <div className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
                {uploadError}
              </div>
            ) : null}

            {FILE_SECTIONS.map((section) => {
              const sectionFiles = filesBySection[section.key];
              const isUploading  = uploadingSection === section.key;
              const isDragging   = draggingSection  === section.key;
              const isOpen       = openSections[section.key];
              const fileRef      = getFileRef(section.key);

              return (
                <div key={section.key} className="overflow-hidden rounded-2xl border border-border-default">
                  {/* Header */}
                  <button
                    type="button"
                    onClick={() => setOpenSections(s => ({ ...s, [section.key]: !s[section.key] }))}
                    className="flex w-full items-center justify-between bg-surface px-4 py-3 transition-colors hover:bg-surface-elevated"
                  >
                    <div className="flex items-center gap-2.5">
                      {isOpen
                        ? <FolderOpen className="h-4 w-4 text-accent" />
                        : <Folder className="h-4 w-4 text-muted-foreground" />}
                      <span className={`text-sm font-bold ${isOpen ? "text-foreground" : "text-ink-secondary"}`}>
                        {section.label}
                      </span>
                      {sectionFiles.length > 0 ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                          {sectionFiles.length}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {canEditProject ? (
                        <span
                          role="button"
                          tabIndex={0}
                          className="inline-flex items-center gap-1 rounded-xl border border-border-default bg-surface-elevated px-2.5 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-border-default hover:text-foreground"
                          onClick={(e) => { e.stopPropagation(); setUploadError(null); fileRef.current?.click(); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); fileRef.current?.click(); } }}
                        >
                          <Plus className="h-3 w-3" />
                          Agregar
                        </span>
                      ) : null}
                      {section.key === "fotos" && canEditProject ? (
                        <span
                          role="button"
                          tabIndex={0}
                          className="inline-flex items-center gap-1 rounded-xl border border-border-default bg-surface-elevated px-2.5 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-border-default hover:text-foreground"
                          onClick={(e) => { e.stopPropagation(); setUploadError(null); cameraInputRef.current?.click(); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); cameraInputRef.current?.click(); } }}
                        >
                          <Camera className="h-3 w-3" />
                          Cámara
                        </span>
                      ) : null}
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {/* Body */}
                  {isOpen ? (
                    <div className="space-y-3 bg-surface-elevated/20 p-4">
                      {/* Banner de estado (todas las secciones) */}
                      {(() => {
                        const st = getSectionStatus(section.key);
                        const noLabel = section.key === "fotos" ? "Sin fotos de evidencia" : `Sin archivos en ${section.label.toLowerCase()}`;
                        const approveExtra = section.key === "fotos" ? { fotos: true } : {};
                        const rejectExtra  = section.key === "fotos" ? { fotos: false } : {};
                        return (
                          <div className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                            st === "en-revision" ? "border border-brand/25 bg-brand/10 text-brand" :
                            st === "si"          ? "border border-success/25 bg-success/10 text-success" :
                            st === "rechazado"   ? "border border-danger/25 bg-danger/10 text-danger" :
                            "border border-border-default bg-surface text-muted-foreground"
                          }`}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <span>
                                {st === "no"          ? noLabel :
                                 st === "en-revision" ? "En revisión — pendiente de aprobación del admin" :
                                 st === "si"          ? "Si" :
                                 "Rechazado — sube una nueva versión"}
                              </span>
                              {canManageProjectStatus && st === "en-revision" ? (
                                <div className="flex shrink-0 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSectionStatus(section.key, "si");
                                      onUpdateProject(project.id, { [statusFieldOf(section.key)]: "si", ...approveExtra });
                                    }}
                                    className="flex items-center gap-1.5 rounded-xl bg-success/30 px-4 py-2 text-sm font-bold text-success ring-1 ring-success/30 transition hover:bg-success/50"
                                  >
                                    <Check className="h-3.5 w-3.5" /> Aprobar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSectionStatus(section.key, "rechazado");
                                      onUpdateProject(project.id, { [statusFieldOf(section.key)]: "rechazado", ...rejectExtra });
                                    }}
                                    className="flex items-center gap-1.5 rounded-xl bg-danger/10 px-4 py-2 text-sm font-bold text-danger ring-1 ring-danger/30 transition hover:bg-danger/20"
                                  >
                                    <XCircle className="h-3.5 w-3.5" /> Rechazar
                                  </button>
                                </div>
                              ) : canManageProjectStatus && st === "si" ? (
                                <div className="flex shrink-0 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSectionStatus(section.key, "en-revision");
                                      onUpdateProject(project.id, { [statusFieldOf(section.key)]: "en-revision", ...(section.key === "fotos" ? { fotos: true } : {}) });
                                    }}
                                    className="flex items-center gap-1.5 rounded-xl bg-brand/10 px-4 py-2 text-sm font-bold text-brand ring-1 ring-brand/30 transition hover:bg-brand/20"
                                  >
                                    <XCircle className="h-3.5 w-3.5" /> Quitar aprobación
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSectionStatus(section.key, "rechazado");
                                      onUpdateProject(project.id, { [statusFieldOf(section.key)]: "rechazado", ...rejectExtra });
                                    }}
                                    className="flex items-center gap-1.5 rounded-xl bg-danger/10 px-4 py-2 text-sm font-bold text-danger ring-1 ring-danger/30 transition hover:bg-danger/20"
                                  >
                                    <XCircle className="h-3.5 w-3.5" /> Rechazar
                                  </button>
                                </div>
                              ) : canManageProjectStatus && st === "rechazado" ? (
                                <div className="flex shrink-0 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSectionStatus(section.key, "si");
                                      onUpdateProject(project.id, { [statusFieldOf(section.key)]: "si", ...approveExtra });
                                    }}
                                    className="flex items-center gap-1.5 rounded-xl bg-success/30 px-4 py-2 text-sm font-bold text-success ring-1 ring-success/30 transition hover:bg-success/50"
                                  >
                                    <Check className="h-3.5 w-3.5" /> Aprobar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSectionStatus(section.key, "en-revision");
                                      onUpdateProject(project.id, { [statusFieldOf(section.key)]: "en-revision", ...(section.key === "fotos" ? { fotos: true } : {}) });
                                    }}
                                    className="flex items-center gap-1.5 rounded-xl bg-brand/10 px-4 py-2 text-sm font-bold text-brand ring-1 ring-brand/30 transition hover:bg-brand/20"
                                  >
                                    <XCircle className="h-3.5 w-3.5" /> Poner en revisión
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Drop zone */}
                      {canEditProject ? (
                        <div
                          onDragOver={(e) => { e.preventDefault(); setDraggingSection(section.key); }}
                          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDraggingSection(null); }}
                          onDrop={async (e) => {
                            e.preventDefault();
                            setDraggingSection(null);
                            const dropped = Array.from(e.dataTransfer.files).filter(f => {
                              if (section.onlyImages) return f.type.startsWith("image/");
                              if (section.key === "reporte") return /\.(xls|xlsx|doc|docx|dwg|dxf)$/i.test(f.name);
                              return true;
                            });
                            if (!dropped.length) {
                              if (section.onlyImages) setUploadError("FOTOS solo acepta imágenes (JPG, PNG, WEBP).");
                              else if (section.key === "reporte") setUploadError("REPORTE solo acepta Excel (.xlsx), Word (.docx) y AutoCAD (.dwg, .dxf).");
                              return;
                            }
                            await handleUpload(dropped, section.key);
                          }}
                          className={`rounded-xl border-2 border-dashed px-4 py-2.5 transition-all duration-200 ${
                            isDragging ? "scale-[1.005] border-accent/60 bg-accent/5" : "border-border-default bg-surface/50"
                          }`}
                        >
                          {isUploading ? (
                            <div className="flex items-center justify-center gap-2.5 py-0.5">
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                              <p className="text-xs font-semibold text-accent">Subiendo…</p>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <FileUp className={`h-3.5 w-3.5 shrink-0 ${isDragging ? "text-accent" : ""}`} />
                              <span>{isDragging ? "Suelta para subir" : `Arrastra archivos aquí · máx. ${section.maxMB} MB`}</span>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Archivos de la sección */}
                      {sectionFiles.length > 0 ? (
                        section.onlyImages ? (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {sectionFiles.map((file) => (
                              <button
                                key={file.id}
                                type="button"
                                onClick={() => openGallery(sectionFiles, file.id)}
                                className="group relative aspect-square overflow-hidden rounded-2xl bg-muted ring-1 ring-white/5 transition-all duration-200 hover:ring-accent/40 hover:shadow-lg"
                              >
                                <img
                                  src={resolveImgUrl(file.url ?? '', project.id, file.id)}
                                  alt={file.name}
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  loading="lazy"
                                  onError={(e) => {
                                    const img = e.currentTarget;
                                    img.style.display = "none";
                                    const parent = img.parentElement;
                                    if (parent && !parent.querySelector(".thumb-fallback")) {
                                      const fb = document.createElement("div");
                                      fb.className = "thumb-fallback absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground";
                                      fb.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg><span style="font-size:10px">Sin vista</span>';
                                      parent.appendChild(fb);
                                    }
                                  }}
                                />
                                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/75 via-black/10 to-transparent p-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                  <p className="truncate text-left text-[11px] font-semibold text-white">{file.name}</p>
                                </div>
                                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                  {file.url ? (
                                    <a href={serveFileUrl(project.id, file.id, true)} download={file.name} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80">
                                        <Download className="h-3.5 w-3.5" />
                                      </div>
                                    </a>
                                  ) : null}
                                  {canDeleteFiles ? (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); void handleDeleteFileInSection(file.id, section.key); }}
                                      disabled={deletingFileId === file.id}
                                      className="flex h-7 w-7 items-center justify-center rounded-xl bg-danger/80 text-white backdrop-blur-sm transition-colors hover:bg-danger disabled:opacity-50"
                                    >
                                      {deletingFileId === file.id
                                        ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        : <Trash2 className="h-3.5 w-3.5" />}
                                    </button>
                                  ) : null}
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {sectionFiles.map((file) => {
                              const isImg = /\.(png|jpg|jpeg|gif|webp)$/i.test(file.name);
                              return (
                                <div key={file.id} className="flex items-center gap-3 rounded-[18px] bg-muted/50 px-3 py-2.5 transition-colors hover:bg-muted/80">
                                  {isImg && file.url ? (
                                    <img src={resolveImgUrl(file.url, project.id, file.id)} alt={file.name} className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                                  ) : (
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-border-default text-[10px] font-black uppercase text-ink-secondary">
                                      {file.name.split(".").pop()}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-foreground">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">{file.sizeLabel} · {formatDate(file.uploadedAt)}</p>
                                  </div>
                                  <div className="flex shrink-0 gap-1.5">
                                    {file.url ? (() => {
                                      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
                                      const isPreviewableDoc = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext);
                                      const isPreviewableImg = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
                                      const fileServeUrl = serveFileUrl(project.id, file.id);

                                      // Para imágenes: abrir en lightbox; para docs: Google Docs Viewer; para otros: descargar
                                      const handleEye = () => {
                                        if (isPreviewableImg) {
                                          openGallery(sectionFiles.filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name)), file.id);
                                        } else if (isPreviewableDoc) {
                                          // Google Docs Viewer permite previsualizar PDF/Word/Excel sin descargar
                                          const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fileServeUrl)}&embedded=true`;
                                          window.open(viewerUrl, "_blank");
                                        } else {
                                          window.open(fileServeUrl, "_blank");
                                        }
                                      };

                                      return (
                                        <>
                                          <button type="button" onClick={handleEye} title={isPreviewableImg || isPreviewableDoc ? "Vista previa" : "Abrir archivo"} className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-default text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent">
                                            <Eye className="h-3.5 w-3.5" />
                                          </button>
                                          <a href={serveFileUrl(project.id, file.id, true)} download={file.name} target="_blank" rel="noreferrer">
                                            <button type="button" title="Descargar" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-default text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent">
                                              <Download className="h-3.5 w-3.5" />
                                            </button>
                                          </a>
                                        </>
                                      );
                                    })() : null}
                                    {canDeleteFiles ? (
                                      <button
                                        type="button"
                                        onClick={() => void handleDeleteFileInSection(file.id, section.key)}
                                        disabled={deletingFileId === file.id}
                                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-danger/30 text-danger/60 transition-colors hover:border-danger hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                                      >
                                        {deletingFileId === file.id
                                          ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-danger border-t-transparent" />
                                          : <Trash2 className="h-3.5 w-3.5" />}
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )
                      ) : (
                        <p className="py-3 text-center text-xs font-semibold text-ink-tertiary">
                          Sin archivos en esta carpeta
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })() : null}

      {/* ══ GALERÍA DE IMÁGENES ══ */}
      {galleryFiles.length > 0 ? (
        <div
          className="fixed inset-0 z-[9999] flex flex-col bg-black/95"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape")     closeGallery();
            if (e.key === "ArrowLeft"  && galleryFiles.length > 1) galleryPrev();
            if (e.key === "ArrowRight" && galleryFiles.length > 1) galleryNext();
          }}
        >
          {/* ── Barra superior ── */}
          <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 bg-black/60 backdrop-blur-sm border-b border-white/5">
            <div className="flex items-center gap-3 min-w-0">
              {/* Thumbnails mini-strip */}
              <div className="hidden sm:flex items-center gap-1.5">
                {galleryFiles.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => { setGalleryBroken(false); setGalleryIndex(i); }}
                    className={`h-8 w-8 shrink-0 overflow-hidden rounded-lg ring-2 transition-all ${i === galleryIndex ? "ring-accent scale-110" : "ring-transparent opacity-50 hover:opacity-80"}`}
                  >
                    <img
                      src={serveFileUrl(project.id, f.id)}
                      alt={f.name}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white leading-tight">{galleryFiles[galleryIndex]?.name}</p>
                <p className="text-[11px] text-muted-foreground">{galleryFiles[galleryIndex]?.sizeLabel} · foto {galleryIndex + 1} de {galleryFiles.length}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {lightboxFile ? (
                <a
                  href={serveFileUrl(project.id, lightboxFile.id, true)}
                  download={lightboxFile.name}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar
                </a>
              ) : null}
              <button
                type="button"
                onClick={closeGallery}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-ink-secondary transition hover:bg-white/20 hover:text-foreground"
                aria-label="Cerrar galería"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── Área de imagen ── */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden" onClick={closeGallery}>
            {/* Flecha izquierda */}
            {galleryFiles.length > 1 ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); galleryPrev(); }}
                className="absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/75 hover:scale-105"
                aria-label="Anterior"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            ) : null}

            {galleryBroken ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl bg-surface p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-ink-tertiary">
                  <ZoomIn className="h-7 w-7" />
                </div>
                <p className="text-sm text-muted-foreground">No se puede previsualizar</p>
                {lightboxFile ? (
                  <a
                    href={serveFileUrl(project.id, lightboxFile.id, true)}
                    download={lightboxFile.name}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
                  >
                    <Download className="h-4 w-4" />
                    Descargar
                  </a>
                ) : null}
              </div>
            ) : (
              <img
                key={galleryFiles[galleryIndex]?.id}
                src={lightboxUrl ?? ""}
                alt={galleryFiles[galleryIndex]?.name ?? ""}
                className="max-h-full max-w-full object-contain select-none"
                style={{ maxHeight: "calc(100vh - 120px)" }}
                draggable={false}
                onClick={(e) => e.stopPropagation()}
                onError={() => setGalleryBroken(true)}
              />
            )}

            {/* Flecha derecha */}
            {galleryFiles.length > 1 ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); galleryNext(); }}
                className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/75 hover:scale-105"
                aria-label="Siguiente"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            ) : null}
          </div>

          {/* ── Puntos de navegación ── */}
          {galleryFiles.length > 1 ? (
            <div className="flex shrink-0 justify-center gap-1.5 py-3">
              {galleryFiles.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setGalleryBroken(false); setGalleryIndex(i); }}
                  className={`rounded-full transition-all ${i === galleryIndex ? "h-2 w-6 bg-accent" : "h-2 w-2 bg-white/30 hover:bg-white/50"}`}
                  aria-label={`Foto ${i + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
