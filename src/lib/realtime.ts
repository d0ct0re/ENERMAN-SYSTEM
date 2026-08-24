// Servicio de tiempo real via Short Polling — compatible con Hostinger shared hosting
// Intervalo: cada 4 segundos. Detecta mensajes nuevos, proyectos modificados y notificaciones.
// Incluye detección de conexión perdida: 3 fallos consecutivos → emite status "offline".

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";
const POLL_MS  = 4000;

export interface ChatMessage {
  id: string;
  projectId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  message: string;
  isPriority: boolean;
  createdAt: string;
}

interface PollResponse {
  ok: boolean;
  messages: ChatMessage[];
  updatedProjects: Record<string, unknown>[];
  allProjectIds: string[];
  updatedRequests: Record<string, unknown>[];
  allRequestIds: string[];
  notifications: Record<string, unknown>[];
  dismissedNotificationIds?: string[];
  readNotificationIds?: string[];
  dismissedDateKeys?: string[];
  readDateKeys?: string[];
  serverTime: string;
}

export interface NotifSync {
  notifs: Record<string, unknown>[];
  dismissedIds: string[];
  readIds: string[];
  dismissedDateKeys: string[];
  readDateKeys: string[];
}

type MsgCb     = (msgs: ChatMessage[]) => void;
type ProjectCb = (updated: Record<string, unknown>[], allIds: string[]) => void;
type RequestCb = (updated: Record<string, unknown>[], allIds: string[]) => void;
type NotifCb   = (sync: NotifSync) => void;
type StatusCb  = (online: boolean) => void;

// Cuántos polls fallidos consecutivos antes de declarar "offline"
const OFFLINE_THRESHOLD = 3;

class RealtimeService {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private lastPoll  = new Date().toISOString();
  private projectId: string | null = null;
  private active    = false;

  private msgCbs:     MsgCb[]     = [];
  private projectCbs: ProjectCb[] = [];
  private requestCbs: RequestCb[] = [];
  private notifCbs:   NotifCb[]   = [];
  private statusCbs:  StatusCb[]  = [];

  // Seguimiento de conexión
  private failCount  = 0;
  private _isOnline  = true;

  get isOnline(): boolean { return this._isOnline; }

  // ── Ciclo de vida ──────────────────────────────────────────────
  start(): void {
    if (this.active) return;
    this.active    = true;
    this.failCount = 0;
    this._isOnline = true;
    this.lastPoll  = new Date().toISOString();
    this.timerId   = setInterval(() => { void this.poll(); }, POLL_MS);
  }

  stop(): void {
    this.active = false;
    if (this.timerId !== null) clearInterval(this.timerId);
    this.timerId     = null;
    this.projectId   = null;
    this.msgCbs      = [];
    this.projectCbs  = [];
    this.requestCbs  = [];
    this.notifCbs    = [];
    this.statusCbs   = [];
    this.failCount   = 0;
  }

  // Informa al servicio qué proyecto está abierto (para recibir sus mensajes)
  setProject(id: string | null): void {
    this.projectId = id;
  }

  // ── Suscripciones ──────────────────────────────────────────────
  onMessages(cb: MsgCb): () => void {
    this.msgCbs.push(cb);
    return () => { this.msgCbs = this.msgCbs.filter(c => c !== cb); };
  }

  onProjectUpdate(cb: ProjectCb): () => void {
    this.projectCbs.push(cb);
    return () => { this.projectCbs = this.projectCbs.filter(c => c !== cb); };
  }

  onRequestUpdate(cb: RequestCb): () => void {
    this.requestCbs.push(cb);
    return () => { this.requestCbs = this.requestCbs.filter(c => c !== cb); };
  }

  onNotification(cb: NotifCb): () => void {
    this.notifCbs.push(cb);
    return () => { this.notifCbs = this.notifCbs.filter(c => c !== cb); };
  }

  /** Suscribirse a cambios de conectividad. Recibe `true` cuando la conexión se recupera,
   *  `false` cuando se pierden 3+ polls consecutivos. */
  onStatus(cb: StatusCb): () => void {
    this.statusCbs.push(cb);
    return () => { this.statusCbs = this.statusCbs.filter(c => c !== cb); };
  }

  // ── API calls ──────────────────────────────────────────────────

  // Carga el historial completo de mensajes de un proyecto al abrir el diálogo
  async loadMessages(projectId: string): Promise<ChatMessage[]> {
    const res = await fetch(
      `${API_BASE}/index.php?action=get_messages&project_id=${encodeURIComponent(projectId)}&since=1970-01-01T00:00:00Z`,
      { credentials: "include" }
    );
    if (!res.ok) return [];
    const data = await res.json() as { messages?: ChatMessage[] };
    return data.messages ?? [];
  }

  // Envía un mensaje de chat al servidor
  async sendMessage(projectId: string, message: string, isPriority: boolean): Promise<ChatMessage | null> {
    const res = await fetch(`${API_BASE}/index.php?action=send_message`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, message, isPriority }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { message?: ChatMessage };
    return data.message ?? null;
  }

  // ── Polling interno ────────────────────────────────────────────
  private async poll(): Promise<void> {
    if (!this.active) return;
    try {
      const since = this.lastPoll;
      const pid   = this.projectId ? `&project_id=${encodeURIComponent(this.projectId)}` : "";
      const url   = `${API_BASE}/index.php?action=poll&since=${encodeURIComponent(since)}${pid}`;

      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) { this.recordFailure(); return; }

      const data = await res.json() as PollResponse;
      if (!data.ok) { this.recordFailure(); return; }

      // ── Poll exitoso: restablecer contador y señalizar "online" ──
      this.recordSuccess();

      // Avanzar el cursor de tiempo para el próximo poll
      this.lastPoll = data.serverTime ?? new Date().toISOString();

      if (data.messages?.length > 0)
        this.msgCbs.forEach(cb => cb(data.messages));

      if (data.updatedProjects?.length > 0 || data.allProjectIds?.length > 0)
        this.projectCbs.forEach(cb => cb(data.updatedProjects ?? [], data.allProjectIds ?? []));

      if (data.updatedRequests?.length > 0 || data.allRequestIds?.length > 0)
        this.requestCbs.forEach(cb => cb(data.updatedRequests ?? [], data.allRequestIds ?? []));

      const dismissedIds     = data.dismissedNotificationIds ?? [];
      const readIds          = data.readNotificationIds ?? [];
      const dismissedDateKeys = data.dismissedDateKeys ?? [];
      const readDateKeys      = data.readDateKeys ?? [];
      if (data.notifications?.length > 0 || dismissedIds.length > 0 || readIds.length > 0
        || dismissedDateKeys.length > 0 || readDateKeys.length > 0)
        this.notifCbs.forEach(cb => cb({ notifs: data.notifications ?? [], dismissedIds, readIds, dismissedDateKeys, readDateKeys }));

    } catch {
      // Error de red (timeout, DNS, etc.)
      this.recordFailure();
    }
  }

  private recordSuccess(): void {
    this.failCount = 0;
    if (!this._isOnline) {
      this._isOnline = true;
      this.statusCbs.forEach(cb => cb(true));
    }
  }

  private recordFailure(): void {
    this.failCount++;
    if (this._isOnline && this.failCount >= OFFLINE_THRESHOLD) {
      this._isOnline = false;
      this.statusCbs.forEach(cb => cb(false));
    }
  }
}

// Singleton — importar este objeto en cualquier componente
export const realtime = new RealtimeService();
