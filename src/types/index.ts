export type RoleKey = "engineer" | "admin" | "supervisor" | "system_admin";

export type ExpenseType = "material" | "personal";
export type ExpenseCategory =
  | "material" | "herramienta" | "transporte" | "servicio"
  | "sueldo" | "horas_extras" | "viaticos" | "bono";

export interface ProjectExpenseItem {
  id: string;
  tipo: ExpenseType;
  titulo: string;
  descripcion: string;
  monto: number;
  categoria: ExpenseCategory;
  fecha: string;
  imagenes: string[];
  creadoPor: string;
  createdAt: string;
}

export type ProjectStatus =
  | "en-concurso"
  | "en-programacion"
  | "in-progress"
  | "pendiente-aprobacion"
  | "pendiente-autorizar"
  | "reasignado"
  | "cierre-por-sistema"
  | "comparativa"
  | "no-autorizado"
  | "completed"
  | "cancelled";

export type RequestStatus = "under-review" | "needs-correction" | "rejected" | "approved";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export type TipoPago =
  | "asignacion-directa"
  | "cancelado"
  | "comparativa"
  | "concurso"
  | "concurso-ad"
  | "contrato"
  | "convenio";

export type PriorityLevel = "low" | "medium" | "high" | "critical";

export type ProjectType =
  | "INST" | "MTTO" | "MEDI" | "SUMI" | "ADE" | "BOMB" | "NEUM" | "INGE" | "RENT"
  // Tipos legacy — solo para proyectos existentes, no aparecen en formularios de creación
  | "EMRG" | "CANC" | "COMP" | "COMPR" | "ESTU"
  | "GUAR" | "ILUM" | "INSP" | "MNTC"
  | "MNTP" | "OBRA" | "REMO" | "TERM";

// Tipos disponibles en formularios de creación (los 9 activos)
export const ACTIVE_PROJECT_TYPES: ProjectType[] = ["INST", "MTTO", "SUMI", "ADE", "MEDI", "BOMB", "NEUM", "INGE", "RENT"];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  INST: "Instalación",
  MTTO: "Mantenimiento",
  MEDI: "Medición",
  SUMI: "Suministro",
  ADE:  "Adecuación",
  BOMB: "Bomba",
  NEUM: "Neumática",
  INGE: "Ingeniería",
  RENT: "Renta",
  // Legacy
  EMRG: "Atención de emergencia",
  CANC: "Cancelado",
  COMP: "Comparativa",
  COMPR: "Compresor",
  ESTU: "Estudios especiales",
  GUAR: "Guardias",
  ILUM: "Iluminación",
  INSP: "Inspección termográfica",
  MNTC: "Mantenimiento correctivo",
  MNTP: "Mantenimiento preventivo",
  OBRA: "Obra civil",
  REMO: "Remodelación",
  TERM: "Termografía",
};

export const TIPO_PAGO_LABELS: Record<TipoPago, string> = {
  "asignacion-directa": "Asignación directa",
  cancelado: "Cancelado",
  comparativa: "Comparativa",
  concurso: "Concurso",
  "concurso-ad": "Concurso (Asig. Directa)",
  contrato: "Contrato",
  convenio: "Convenio",
};

export type EstimacionStatus =
  | "Pendiente" | "Realizada" | "Cancelada" | "Comparativa" | "N/A" | "Sin información";

export type CotizacionStatus =
  | "Pendiente" | "Realizada" | "Enviada" | "Revisión" | "Cancelada" | "Comparativa" | "N/A" | "Sin información";

export type InvoiceStatus =
  | "solicitada"
  | "recibida"
  | "en-portal"
  | "enviada"
  | "pagada"
  | "cancelada";

export type MDP = "PUE" | "PPD";

export interface InvoiceItem {
  id: string;
  fechaSolicitud: string;
  factura?: string;
  oc: string;
  subtotal: number;
  facturarA: string;
  promesaPago?: string;
  status: InvoiceStatus;
  mdp: MDP;
  complementoPago: string;
  fechaPago?: string;
  abonoAntesIva?: number;
  createdAt: string;
  createdBy: string;
}

export interface UserItem {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  role: RoleKey;
  roleLabel: string;
  avatar: string;
  email: string;
  password?: string;
  department: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  dismissedNotifKeys?: string[];
  readNotifKeys?: string[];
  dismissedNotifIds?: string[];
  readNotifIds?: string[];
}

export interface NotificationRecipientState {
  read: boolean;
  dismissedAt?: string | null;
}

export interface NotificationItem {
  id: string;
  role: RoleKey;
  userIds?: string[];
  title: string;
  description: string;
  createdAt: string;
  isRead: boolean;
  relatedRequestId?: string;
  relatedProjectId?: string;
  // Rediseño 2026-09: estado por destinatario embebido en la propia notificación, en vez de
  // filas-marcador sueltas (isReadMarker/isDismissMarker). `isRead` arriba se conserva para
  // compatibilidad con filas viejas que nunca tuvieron `recipients`.
  updatedAt?: string;
  groupKey?: string;
  occurrenceCount?: number;
  recipients?: Record<string, NotificationRecipientState>;
}

export interface ActivityLogItem {
  id: string;
  user_id?: string | null;
  user_name?: string | null;
  user_role?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  entity_name?: string | null;
  details?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface CommentItem {
  id: string;
  authorId: string;
  message: string;
  createdAt: string;
  isPriority: boolean;
}

export interface ProjectHistoryItem {
  id: string;
  createdAt: string;
  action: string;
  author: string;
}

export type FileCategory = "fotos" | "estimacion" | "cotizacion" | "reporte" | "otros" | "subcontratados" | "subcontratadosFacturas" | "pagoComprobante";
export type FileStatus = "no" | "en-revision" | "si" | "rechazado";

export interface ProjectFileItem {
  id: string;
  name: string;
  sizeLabel: string;
  sizeBytes?: number;
  uploadedAt: string;
  url?: string;
  category?: FileCategory;
  // Aprobación por archivo individual — hoy solo la usa "subcontratadosFacturas"
  // (la aprueba el supervisor). Las demás categorías siguen usando el status a
  // nivel de carpeta completa (ej. reporteFileStatus en ProjectItem).
  status?: FileStatus;
  // Liga el archivo a un PagoProyecto especifico — solo lo usa "pagoComprobante"
  // (Fase 4). El resto de categorias vive a nivel de proyecto, no de pago.
  pagoId?: string;
}

export interface ProjectImportantDateItem {
  id: string;
  title: string;
  date: string;
  description?: string;
  createdBy: string;
  createdAt: string;
}

export interface UbicacionProyecto {
  calle?: string;
  planta?: string;
  edificio?: string;
  piso?: string;
  puerta?: string;
  descripcion?: string;
}

export interface PagoProyecto {
  id: string;
  numeroPago: number;
  estado?: "pendiente" | "realizado";
  cliente?: string;
  monto: number;
  mdp?: "PPD" | "PUE";
  folioFiscal?: string;
  formaPago?: "Efectivo" | "Transferencia" | "Cheque";
  fecha?: string;
  serie?: string;
  folio?: string;
  // Etiqueta cambia segun mdp: "Complemento de Pago" (PPD) / "Factura Única" (PUE) /
  // "Sin Definir" (sin mdp) — ver el render de Fase 4 en project-detail-dialog.tsx.
  complementoPago?: string;
  createdAt: string;
}

export interface ProjectItem {
  id: string;
  structuredName: string;
  baseName: string;
  client: string;
  department: string;
  type: ProjectType;
  status: ProjectStatus;
  paymentStatus: PaymentStatus;
  deletedAt?: string;
  paymentLabel: string;
  priority: PriorityLevel;
  summary: string;
  description: string;
  commitmentDate?: string;
  startDate?: string;
  endDate?: string;
  totalContratado: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  participants: string[];
  files: ProjectFileItem[];
  comments: CommentItem[];
  importantDates?: ProjectImportantDateItem[];
  history: ProjectHistoryItem[];
  expenses: ProjectExpenseItem[];
  tipoPago?: TipoPago;
  oc?: string;
  facturarA?: string;
  negociador?: string;
  usuarioContacto?: string;
  estimacion?: EstimacionStatus;
  cotizacion?: CotizacionStatus;
  totalSinIva?: number;
  cotizacionSubcontratado?: string;
  subtotalSubcontratado?: number;
  invoices?: InvoiceItem[];
  // F1 — Apertura
  lugar?: string;
  ubicacion?: UbicacionProyecto;
  subcontratadoActivo?: boolean;
  nombreSubcontratado?: string;
  // F2 — Ejecución
  fechaSolicitud?: string;
  fotos?: boolean;
  fotosStatus?: FileStatus;
  estimacionFileStatus?: FileStatus;
  cotizacionFileStatus?: FileStatus;
  reporteFileStatus?: FileStatus;
  otrosFileStatus?: FileStatus;
  subcontratadosFileStatus?: FileStatus;
  subcontratadosFacturasFileStatus?: FileStatus;
  reporte?: boolean;
  autorizador?: string;
  comentariosCampo?: string;
  // F3 — Financiero
  iva?: number;
  costoMateriales?: number;
  costoServicios?: number;
  costoPersonal?: number;
  costoSvoContratado?: number;
  costoComision?: number;
  costoOtros?: number;
  oapc?: number;
  egpc?: number;
  luna?: number;
  pagoPadillas?: boolean;
  estatusPagoTrabajo?: "Pendiente" | "Pagado";
  estatusPagoAlberto?: "Pendiente" | "Pagado";
  estatusPagoLuna?: "Pendiente" | "Pagado";
  comentariosDireccion?: string;
  // F4 — Pagos
  pagosProyecto?: PagoProyecto[];
  estatusPagoFinal?: "Pendiente" | "Pagado";
}

export interface RequestItem {
  id: string;
  sequence?: string;
  structuredName: string;
  baseName: string;
  client: string;
  department: string;
  lugar?: string;
  type: ProjectType;
  description: string;
  status: RequestStatus;
  createdAt: string;
  createdBy: string;
  duplicateOfProjectId?: string;
  rejectionReason?: string;
  correctionReason?: string;
  linkedProjectId?: string;
}
