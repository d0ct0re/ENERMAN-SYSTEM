import { ActivityLogItem, CommentItem, InvoiceItem, NotificationItem, ProjectExpenseItem, ProjectFileItem, ProjectHistoryItem, ProjectItem, RequestItem, UserItem } from "@/types";

export interface AppStatePayload {
  users: UserItem[];
  projects: ProjectItem[];
  requests: RequestItem[];
  notifications: NotificationItem[];
  dismissedDateKeys?: string[];
  readDateKeys?: string[];
}

export class SessionRequiredError extends Error {
  constructor() {
    super("session_required");
    this.name = "SessionRequiredError";
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

async function apiRequest<T>(action: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/index.php?action=${action}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
    ...init,
  });

  const data: unknown = await response.json().catch(() => ({}));

  if (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).error === "session_required"
  ) {
    throw new SessionRequiredError();
  }

  if (!response.ok) {
    const msg =
      typeof data === "object" && data !== null
        ? ((data as Record<string, unknown>).error as string | undefined) ?? ""
        : "";
    if (response.status === 401) {
      throw new SessionRequiredError();
    }
    throw new Error(msg || `API error ${response.status}`);
  }

  return data as T;
}

export async function fetchAppState(): Promise<AppStatePayload> {
  return apiRequest<AppStatePayload>("bootstrap");
}

export async function saveAppState(payload: AppStatePayload): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("save_state", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ ok: true; user: UserItem }> {
  return apiRequest<{ ok: true; user: UserItem }>("login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logoutUser(): Promise<void> {
  await apiRequest<{ ok: true }>("logout", { method: "POST" });
}

export async function fetchActivityLogs(limit = 120): Promise<ActivityLogItem[]> {
  const result = await apiRequest<{ ok: true; activity: ActivityLogItem[] }>(`activity_logs&limit=${limit}`);
  return result.activity;
}

export async function createUser(user: UserItem & { password: string }): Promise<UserItem> {
  const result = await apiRequest<{ ok: true; user: UserItem }>("create_user", {
    method: "POST",
    body: JSON.stringify(user),
  });
  return result.user;
}

export async function updateUser(userId: string, updates: Partial<UserItem> & { password?: string }): Promise<UserItem> {
  const result = await apiRequest<{ ok: true; user: UserItem }>("update_user", {
    method: "POST",
    body: JSON.stringify({ id: userId, ...updates }),
  });
  return result.user;
}

export async function deleteUser(userId: string): Promise<void> {
  await apiRequest<{ ok: true }>("delete_user", {
    method: "POST",
    body: JSON.stringify({ id: userId }),
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  await apiRequest<{ ok: true }>("delete_project", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId }),
  });
}

export async function deleteRequest(requestId: string): Promise<void> {
  await apiRequest<{ ok: true }>("delete_request", {
    method: "POST",
    body: JSON.stringify({ request_id: requestId }),
  });
}

// ── Gestión de consecutivos ────────────────────────────────────────────────

/** Obtiene el siguiente consecutivo atómico del servidor y avanza el contador. */
export async function nextSequence(): Promise<string> {
  const result = await apiRequest<{ ok: true; sequence: string; value: number }>("next_sequence", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return result.sequence;
}

/** Consulta el valor actual del contador (solo gestor). */
export async function getSequenceInfo(): Promise<{ current: number; next: number; display: string }> {
  return apiRequest<{ ok: true; current: number; next: number; display: string }>("get_sequence_info");
}

/** Fija el contador a un valor exacto (solo gestor). */
export async function setSequenceCounter(value: number): Promise<void> {
  await apiRequest<{ ok: true }>("set_sequence_counter", {
    method: "POST",
    body: JSON.stringify({ value }),
  });
}

/** Sube el contador a max(actual, minimum) — útil tras crear un proyecto con número manual. */
export async function bumpSequenceCounter(minimum: number): Promise<void> {
  await apiRequest<{ ok: true }>("bump_sequence_counter", {
    method: "POST",
    body: JSON.stringify({ minimum }),
  });
}

export async function resetActiveUserPasswords(password = "ASBT2026!"): Promise<{ ok: true; updated: number }> {
  return apiRequest<{ ok: true; updated: number }>("reset_active_passwords", {
    method: "POST",
    body: JSON.stringify({
      password,
      confirm: "RESET_ACTIVE_PASSWORDS",
    }),
  });
}

/** Append atómico de gasto — evita colisión si dos ingenieros registran gastos simultáneamente */
export async function addProjectExpense(
  projectId: string,
  expense: ProjectExpenseItem,
  historyEntry: ProjectHistoryItem,
): Promise<void> {
  await apiRequest<{ ok: true }>("add_project_expense", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, expense, history: historyEntry }),
  });
}

/** Eliminación atómica de gasto por id — array_filter directo en BD */
export async function deleteProjectExpense(projectId: string, expenseId: string): Promise<void> {
  await apiRequest<{ ok: true }>("delete_project_expense", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, expense_id: expenseId }),
  });
}

/** Append atómico de factura — evita colisión si dos usuarios agregan facturas simultáneamente */
export async function addProjectInvoice(
  projectId: string,
  invoice: InvoiceItem,
  historyEntry: ProjectHistoryItem,
): Promise<void> {
  await apiRequest<{ ok: true }>("add_project_invoice", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, invoice, history: historyEntry }),
  });
}

/** Actualización atómica de factura por id — merge quirúrgico solo en el nodo de esa factura */
export async function updateProjectInvoice(
  projectId: string,
  invoiceId: string,
  updates: Partial<InvoiceItem>,
): Promise<void> {
  await apiRequest<{ ok: true }>("update_project_invoice", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, invoice_id: invoiceId, updates }),
  });
}

/** Append atómico de comentario — evita sobreescritura si dos usuarios comentan simultáneamente */
export async function addProjectComment(
  projectId: string,
  comment: CommentItem,
  historyEntry: ProjectHistoryItem,
): Promise<void> {
  await apiRequest<{ ok: true }>("add_project_comment", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, comment, history: historyEntry }),
  });
}

/** Mutación atómica: actualiza solo los campos indicados de un proyecto en BD */
export async function updateProject(projectId: string, fields: Partial<ProjectItem>): Promise<void> {
  await apiRequest<{ ok: true }>("update_project", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, fields }),
  });
}

/** Mutación atómica: actualiza solo los campos indicados de una solicitud en BD */
export async function updateRequest(requestId: string, fields: Partial<RequestItem>): Promise<void> {
  await apiRequest<{ ok: true }>("update_request", {
    method: "POST",
    body: JSON.stringify({ request_id: requestId, fields }),
  });
}

export async function createRequest(request: RequestItem): Promise<void> {
  await apiRequest<{ ok: true }>("create_request", {
    method: "POST",
    body: JSON.stringify({ request }),
  });
}

export async function createNotification(notification: NotificationItem): Promise<void> {
  await apiRequest<{ ok: true }>("create_notification", {
    method: "POST",
    body: JSON.stringify({ notification }),
  });
}

export async function deleteNotification(id: string): Promise<void> {
  await apiRequest<{ ok: true }>("delete_notification", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiRequest<{ ok: true }>("mark_notification_read", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export async function updateNotifPrefs(opts: { dismissedDateKeys?: string[]; readDateKeys?: string[] }): Promise<void> {
  await apiRequest<{ ok: true }>("update_notif_prefs", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiRequest<{ ok: true }>("mark_all_notifications_read", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function uploadFile(projectId: string, file: File, category?: import("@/types").FileCategory): Promise<ProjectFileItem> {
  const formData = new FormData();
  formData.append("project_id", projectId);
  formData.append("file", file);
  if (category) formData.append("category", category);

  const response = await fetch(`${API_BASE_URL}/index.php?action=upload_file`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data: unknown = await response.json().catch(() => ({}));

  if (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).error === "session_required"
  ) {
    throw new SessionRequiredError();
  }

  if (!response.ok) {
    const msg =
      typeof data === "object" && data !== null
        ? ((data as Record<string, unknown>).error as string | undefined) ?? ""
        : "";
    throw new Error(msg || `Error al subir archivo (${response.status})`);
  }

  return (data as { ok: true; file: ProjectFileItem }).file;
}

export async function downloadBackup(): Promise<void> {
  // Usa export_backup (requiere system_admin). El servidor responde con Content-Disposition
  // para que el navegador lo descargue directamente como archivo .json.
  const url = `${API_BASE_URL}/index.php?action=export_backup&t=${Date.now()}`;
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((data.error as string | undefined) ?? `Error ${response.status}`);
  }
  const blob = await response.blob();
  const fname = `enerman-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

export async function downloadFilesBackup(): Promise<void> {
  const url = `${API_BASE_URL}/index.php?action=backup_files&t=${Date.now()}`;
  const response = await fetch(url, { credentials: "include" });
  if (response.status === 204) throw new Error("No hay archivos subidos aún.");
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((data.error as string | undefined) ?? `Error ${response.status}`);
  }
  const blob = await response.blob();
  const fname = `enerman-archivos-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.zip`;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

export async function restoreBackup(backupJson: unknown): Promise<{ ok: true; restored: { users: number; projects: number; requests: number } }> {
  return apiRequest("restore", {
    method: "POST",
    body: JSON.stringify(backupJson),
  });
}

export async function deleteFile(fileId: string, projectId: string): Promise<void> {
  await apiRequest<{ ok: true }>("delete_file", {
    method: "POST",
    body: JSON.stringify({ file_id: fileId, project_id: projectId }),
  });
}

export function serveFileUrl(projectId: string, fileId: string, download = false): string {
  let url = `${API_BASE_URL}/index.php?action=serve_file&project_id=${encodeURIComponent(projectId)}&file_id=${encodeURIComponent(fileId)}`;
  if (download) url += "&download=1";
  return url;
}

export function resolveImgUrl(fileUrl: string, projectId: string, fileId: string): string {
  if (!fileUrl || fileUrl.startsWith("data:")) return fileUrl;
  // Siempre construir la URL desde API_BASE_URL (HTTPS) para evitar Mixed Content.
  // El PHP en Hostinger puede generar URLs con http:// al estar detrás de un proxy SSL,
  // lo que hace que el browser bloquee las imágenes como "Mixed Content".
  if (projectId && fileId) return serveFileUrl(projectId, fileId);
  return fileUrl;
}

export async function switchSession(userId: string): Promise<void> {
  await apiRequest<{ ok: true }>("switch_session", {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

