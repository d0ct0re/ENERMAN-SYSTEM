import { ActivityLogItem, NotificationItem, ProjectFileItem, ProjectItem, RequestItem, UserItem } from "@/types";

export interface AppStatePayload {
  users: UserItem[];
  projects: ProjectItem[];
  requests: RequestItem[];
  notifications: NotificationItem[];
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

export async function uploadFile(projectId: string, file: File): Promise<ProjectFileItem> {
  const formData = new FormData();
  formData.append("project_id", projectId);
  formData.append("file", file);

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
