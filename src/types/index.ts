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
  | "EMRG" | "BOMB" | "CANC" | "COMP" | "COMPR" | "ESTU"
  | "GUAR" | "ILUM" | "INGE" | "INSP" | "INST" | "MNTC"
  | "MNTP" | "MEDI" | "OBRA" | "REMO" | "RENT" | "TERM";

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  EMRG: "Atención de emergencia",
  BOMB: "Bombas",
  CANC: "Cancelado",
  COMP: "Comparativa",
  COMPR: "Compresor",
  ESTU: "Estudios especiales",
  GUAR: "Guardias",
  ILUM: "Iluminación",
  INGE: "Ingeniería",
  INSP: "Inspección termográfica",
  INST: "Instalación",
  MNTC: "Mantenimiento correctivo",
  MNTP: "Mantenimiento preventivo",
  MEDI: "Medición",
  OBRA: "Obra civil",
  REMO: "Remodelación",
  RENT: "Renta",
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

export interface ProjectFileItem {
  id: string;
  name: string;
  sizeLabel: string;
  uploadedAt: string;
  url?: string;
}

export interface ProjectImportantDateItem {
  id: string;
  title: string;
  date: string;
  description?: string;
  createdBy: string;
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
}

export interface RequestItem {
  id: string;
  sequence?: string;
  structuredName: string;
  baseName: string;
  client: string;
  department: string;
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
