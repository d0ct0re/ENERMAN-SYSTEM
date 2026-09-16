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
  sessionUserId?: string;
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
  settings?: Record<string, unknown>;
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
type SettingsCb = (settings: Record<string, unknown>) => void;
type StatusCb  = (online: boolean) => void;
type SessionMismatchCb = (serverUserId: string) => void;

// Cuántos polls fallidos consecutivos antes de declarar "offline"
const OFFLINE_THRESHOLD = 3;

class RealtimeService {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private lastPoll  = new Date().toISOString();
  private lastPollAttemptAt = 0; // Date.now() del último intento — throttle para el poll "al recuperar foco"
  private projectId: string | null = null;
  private active    = false;
  private onVisible: (() => void) | null = null;
  private onFocus: (() => void) | null = null;
  // Cuenta que el frontend cree tener activa — se compara contra sessionUserId de cada poll
  // para detectar cuando otra pestaña del mismo navegador cambió la sesión compartida.
  private expectedUserId: string | null = null;
  private mismatchNotified = false;

  private msgCbs:     MsgCb[]     = [];
  private projectCbs: ProjectCb[] = [];
  private requestCbs: RequestCb[] = [];
  private notifCbs:   NotifCb[]   = [];
  private settingsCbs: SettingsCb[] = [];
  private statusCbs:  StatusCb[]  = [];
  private sessionMismatchCbs: SessionMismatchCb[] = [];

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

    // Poll inmediato al recuperar foco/visibilidad — sin esto, cada pestaña/cuenta
    // solo se entera de cambios de otros usuarios en su propio ciclo de 4s, cuya fase
    // depende de cuándo se cargó esa pestaña. Es la causa de que, al comparar Admin vs
    // Gestor vs Supervisor lado a lado, uno "se vea más rápido" que otro: es aleatorio,
    // no un trato desigual por rol. Disparar un poll extra al volver a la pestaña hace
    // que la primera mirada tras cambiar de ventana quede al día de inmediato.
    const triggerIfStale = (): void => {
      if (!this.active) return;
      if (Date.now() - this.lastPollAttemptAt > 1500) void this.poll();
    };
    this.onVisible = () => { if (document.visibilityState === "visible") triggerIfStale(); };
    this.onFocus   = () => triggerIfStale();
    document.addEventListener("visibilitychange", this.onVisible);
    window.addEventListener("focus", this.onFocus);
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
    this.settingsCbs = [];
    this.statusCbs   = [];
    this.sessionMismatchCbs = [];
    this.failCount   = 0;
    this.mismatchNotified = false;
    if (this.onVisible) { document.removeEventListener("visibilitychange", this.onVisible); this.onVisible = null; }
    if (this.onFocus)   { window.removeEventListener("focus", this.onFocus); this.onFocus = null; }
  }

  // Informa al servicio qué proyecto está abierto (para recibir sus mensajes)
  setProject(id: string | null): void {
    this.projectId = id;
  }

  // Informa qué cuenta cree tener activa esta pestaña — se llama al iniciar sesión y cada
  // vez que cambia el usuario activo. Reinicia la bandera de aviso para la nueva cuenta.
  setExpectedUser(id: string | null): void {
    this.expectedUserId = id;
    this.mismatchNotified = false;
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

  // Switches globales de "Funciones" — cambian poco, pero se propagan por poll para
  // que un cambio del Gestor se refleje en las demás sesiones abiertas sin recargar.
  onSettingsUpdate(cb: SettingsCb): () => void {
    this.settingsCbs.push(cb);
    return () => { this.settingsCbs = this.settingsCbs.filter(c => c !== cb); };
  }

  // Se dispara cuando el servidor responde con una sesión de OTRA cuenta — típicamente
  // porque otra pestaña de este mismo navegador inició sesión con otro usuario y, al
  // compartir la cookie de PHP, cambió la sesión de todas las pestañas abiertas.
  onSessionMismatch(cb: SessionMismatchCb): () => void {
    this.sessionMismatchCbs.push(cb);
    return () => { this.sessionMismatchCbs = this.sessionMismatchCbs.filter(c => c !== cb); };
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
    this.lastPollAttemptAt = Date.now();
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

      // La sesión del servidor pertenece a otra cuenta — otra pestaña de este navegador
      // cambió de usuario y, al compartir cookie, esta pestaña quedó autenticada como
      // alguien más sin saberlo. No procesar estos datos (son de esa otra cuenta) ni
      // avanzar el cursor — solo avisar una vez para que la UI fuerce un refresh.
      if (this.expectedUserId && data.sessionUserId && data.sessionUserId !== this.expectedUserId) {
        if (!this.mismatchNotified) {
          this.mismatchNotified = true;
          this.sessionMismatchCbs.forEach(cb => cb(data.sessionUserId!));
        }
        return;
      }

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

      if (data.settings)
        this.settingsCbs.forEach(cb => cb(data.settings!));

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
