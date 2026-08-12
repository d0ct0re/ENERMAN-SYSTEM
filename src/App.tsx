import { Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewProjectDialog } from "@/components/dialogs/new-project-dialog";
import { NewRequestDialog } from "@/components/dialogs/new-request-dialog";
import { ProjectDetailDialog } from "@/components/dialogs/project-detail-dialog";
import { RequestDetailDialog } from "@/components/dialogs/request-detail-dialog";
import { notifications as notificationsSeed } from "@/data/notifications";
import { projects as projectsSeed } from "@/data/projects";
import { requests as requestsSeed } from "@/data/requests";
import { users as usersSeed } from "@/data/users";
import { AdminView } from "@/features/admin/admin-view";
import { EngineerView, EngineerTab } from "@/features/engineer/engineer-view";
import { SupervisorView, SupervisorTab } from "@/features/supervisor/supervisor-view";
import { addProjectComment as apiAddProjectComment, addProjectExpense as apiAddProjectExpense, addProjectInvoice as apiAddProjectInvoice, bumpSequenceCounter as apiBumpSequence, createNotification as apiCreateNotification, createRequest as apiCreateRequest, createUser as apiCreateUser, deleteFile as apiDeleteFile, deleteNotification as apiDeleteNotification, deleteProject as apiDeleteProject, deleteProjectExpense as apiDeleteProjectExpense, deleteRequest as apiDeleteRequest, deleteUser as apiDeleteUser, downloadBackup, fetchActivityLogs, fetchAppState, getSequenceInfo as apiGetSequenceInfo, loginUser, logoutUser, markAllNotificationsRead as apiMarkAllNotificationsRead, markNotificationRead as apiMarkNotificationRead, nextSequence as apiNextSequence, saveAppState, SessionRequiredError, setSequenceCounter as apiSetSequenceCounter, switchSession as apiSwitchSession, updateNotifPrefs as apiUpdateNotifPrefs, updateProject as apiUpdateProject, updateProjectInvoice as apiUpdateProjectInvoice, updateRequest as apiUpdateRequest, updateUser as apiUpdateUser, uploadFile } from "@/lib/api";

// ── Caché local: guarda el último estado conocido en localStorage ──────────────
const CACHE_KEY = "amper-state-v1";
const CACHE_TTL = 48 * 60 * 60 * 1000; // 48 horas

// ── Notificaciones de fecha: dismissed y leídas se guardan en localStorage ────
// Las notificaciones de fecha son efímeras (no se persisten en BD).
// La clave base es: important-date-{projectId}-{itemId}
const DISMISSED_DATE_KEYS_KEY = "amper-dismissed-date-notifs";
const READ_DATE_KEYS_KEY      = "amper-read-date-notifs";
const loadLocalSet = (key: string): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]); }
  catch { return new Set(); }
};
const saveLocalSet = (key: string, set: Set<string>): void => {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch { }
};

function saveStateCache(payload: import("@/lib/api").AppStatePayload): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload }));
  } catch { /* cuota llena — ignorar */ }
}

function loadStateCache(): { ts: number; payload: import("@/lib/api").AppStatePayload } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; payload: import("@/lib/api").AppStatePayload };
    if (Date.now() - parsed.ts > CACHE_TTL) return null;
    return parsed;
  } catch { return null; }
}
import { realtime } from "@/lib/realtime";
import { buildStructuredName, formatLocalDateKey } from "@/lib/utils";
import { ActivityLogItem, NotificationItem, ProjectItem, RequestItem, RoleKey, UserItem } from "@/types";
const splashLogoUrl = "/logo%20entrada.png";
const wordmarkLogoUrl = "/logo.png";

type AdminTab = "review" | "allprojects" | "active" | "completed" | "cancelled" | "unpaid" | "rejected" | "correction" | "calendar" | "users" | "projects" | "requests" | "activity" | "cobros";


export default function App(): JSX.Element {
  const [activeUserId, setActiveUserId] = useState<string | null>(() => window.localStorage.getItem("projectra-active-user"));
  const [signedInUserIds, setSignedInUserIds] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("projectra-sessions") ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const [showLogin, setShowLogin] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<UserItem[]>(usersSeed);
  const [projects, setProjects] = useState<ProjectItem[]>(projectsSeed);
  const [requests, setRequests] = useState<RequestItem[]>(requestsSeed);
  const [notifications, setNotifications] = useState(notificationsSeed);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [engineerTab, setEngineerTab] = useState<EngineerTab>("all");
  const [adminTab, setAdminTab] = useState<AdminTab>("allprojects");
  const [supervisorTab, setSupervisorTab] = useState<SupervisorTab>("open");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Avisa al usuario cuando un guardado atómico fire-and-forget falla en el servidor —
  // antes se tragaban en silencio y el usuario creía que su cambio había quedado guardado.
  const notifySaveError = (action: string, err: unknown): void => {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    setToastMessage(`${action}: ${msg}`);
  };
  const [loginEmail, setLoginEmail] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [offlineSince, setOfflineSince] = useState<Date | null>(null);
  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(null);
  const [dismissedDateKeys, setDismissedDateKeys] = useState<Set<string>>(() => loadLocalSet(DISMISSED_DATE_KEYS_KEY));
  const [readDateKeys, setReadDateKeys] = useState<Set<string>>(() => loadLocalSet(READ_DATE_KEYS_KEY));
  // Contador de consecutivos — estado para el panel del gestor
  const [sequenceInfo, setSequenceInfo] = useState<{ current: number; next: number; display: string } | null>(null);
  // Timestamp de la última mutación local (global). Protege allIds-filtering durante grace period.
  const lastMutationAt = useRef(0);
  // Grace period por proyecto: solo bloquea updates del proyecto específico que se acaba de mutar,
  // permitiendo que cambios de OTROS usuarios (admin↔engineer) lleguen sin demora.
  const lastProjectMutationAt = useRef(new Map<string, number>());

  // ── Rastreadores de eliminaciones intencionales ────────────────────────────────────────────
  // Previenen que el polling re-agregue ítems que el Gestor acaba de eliminar.
  // Bug sin esto: al borrar permanentemente, el proyecto queda fuera del estado local pero el
  // servidor aún lo tiene por 1-3s → el polling lo trata como "ítem nuevo" y lo devuelve.

  /** IDs de proyectos eliminados permanentemente en esta sesión. Auto-limpia a los 60s. */
  const permanentlyDeletedProjectIds = useRef(new Set<string>());
  /** IDs de solicitudes eliminadas permanentemente en esta sesión. Auto-limpia a los 60s. */
  const permanentlyDeletedRequestIds = useRef(new Set<string>());
  /** IDs de notificaciones eliminadas localmente. Evita que el polling las re-agregue antes de que el DELETE llegue al servidor. Auto-limpia a los 30s. */
  const deletedNotificationIds = useRef(new Set<string>());
  /**
   * IDs de proyectos movidos a la papelera con su timestamp de deletedAt.
   * Protege contra la race condition post-grace: si apiUpdateProject tarda >8s,
   * el polling devuelve la versión sin deletedAt y el proyecto reaparece como activo.
   * Auto-limpia a los 30s (tiempo suficiente para que la API confirme en Hostinger).
   */
  const softDeletedProjectIds = useRef(new Map<string, string>());

  const signedInAccounts = users.filter((user) => user.isActive !== false && signedInUserIds.includes(user.id));
  const isLoggedOut = showLogin || signedInAccounts.length === 0 || activeUserId === null;
  const activeUser = signedInAccounts.find((user) => user.id === activeUserId) ?? signedInAccounts[0] ?? users[0];

  const activeRole = activeUser.role;
  const isAdminArea = activeRole === "admin" || activeRole === "system_admin";
  const canApproveFiles = activeRole === "supervisor" || activeRole === "system_admin";

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredProjects = useMemo(
    () =>
      projects.filter((project) => {
        if (project.deletedAt) return false;
        if (!normalizedQuery) return true;
        return [project.structuredName, project.client, project.description, project.baseName]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [normalizedQuery, projects],
  );

  const filteredRequests = useMemo(
    () =>
      requests.filter((request) => {
        if (!normalizedQuery) {
          return true;
        }

        return [request.structuredName, request.client, request.description, request.baseName]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [normalizedQuery, requests],
  );

  const engineerCalendarProjects = useMemo(() => {
    return filteredProjects.filter(
      (project) => project.createdBy === activeUser.id || project.participants.includes(activeUser.id),
    );
  }, [activeUser.id, filteredProjects]);

  const engineerRequests = filteredRequests.filter((request) => request.createdBy === activeUser.id);
  const dueImportantDateNotifications = useMemo<NotificationItem[]>(() => {
    const today = formatLocalDateKey(new Date());
    const todayTime = new Date(`${today}T00:00:00`).getTime();
    const daysUntil = (date?: string): number | null => {
      if (!date) return null;
      const t = new Date(`${date}T00:00:00`).getTime();
      return Number.isFinite(t) ? Math.round((t - todayTime) / 86400000) : null;
    };
    const isNear = (date?: string): boolean => {
      const d = daysUntil(date);
      return d !== null && d >= 0 && d <= 3;
    };
    const dateLabel = (date: string): string => {
      const d = daysUntil(date);
      if (d === 0) return "hoy";
      if (d === 1) return "mañana";
      return `en ${d} días`;
    };
    return projects.flatMap((project) => {
      if (project.deletedAt) return [];
      const dates = [
        ...(project.commitmentDate ? [{ id: "commitment", title: "Fecha compromiso", date: project.commitmentDate }] : []),
        ...(project.endDate ? [{ id: "end", title: "Fecha final", date: project.endDate }] : []),
        ...(project.importantDates ?? []).map((item) => ({ id: item.id, title: item.title, date: item.date })),
      ];
      return dates.flatMap((item) => {
        if (!isNear(item.date)) return [];
        const baseKey = `important-date-${project.id}-${item.id}`;
        if (dismissedDateKeys.has(baseKey)) return [];
        const involvedEngineerIds = new Set([project.createdBy, ...project.participants]);
        const userIds = users
          .filter((u) => u.role === "admin" || u.role === "system_admin" || u.role === "supervisor" || (u.role === "engineer" && involvedEngineerIds.has(u.id)))
          .map((u) => u.id);
        return [{
          id: `${baseKey}-${today}`,
          role: "engineer" as const,
          userIds,
          title: `${item.title} ${dateLabel(item.date)}`,
          description: `${project.structuredName}: ${item.title} ${dateLabel(item.date)}.`,
          createdAt: new Date().toISOString(),
          isRead: readDateKeys.has(baseKey),
          relatedProjectId: project.id,
        }];
      });
    });
  }, [projects, users, dismissedDateKeys, readDateKeys]);

  const allNotifications = [...notifications, ...dueImportantDateNotifications];
  const visibleNotifications = allNotifications.filter((notification) => {
    // Si es una notificación de fecha guardada en BD, aplicar el mismo filtro de dismiss que las computadas
    if (notification.id.startsWith("important-date-")) {
      const baseKey = notification.id.replace(/-\d{4}-\d{2}-\d{2}$/, "");
      if (dismissedDateKeys.has(baseKey)) return false;
    }
    return notification.userIds ? notification.userIds.includes(activeUser.id) : notification.role === activeRole;
  });
  const adminReviewRequests = filteredRequests.filter((request) => request.status === "under-review");
  const adminRejectedRequests = filteredRequests.filter((request) => request.status === "rejected");
  const adminCorrectionRequests = filteredRequests.filter((request) => request.status === "needs-correction");
  const ACTIVE_STATUSES = ["en-programacion", "en-concurso", "in-progress", "pendiente-aprobacion", "pendiente-autorizar", "reasignado", "comparativa"];
  const adminActiveProjects = filteredProjects.filter((project) => ACTIVE_STATUSES.includes(project.status));
  const adminCompletedProjects = filteredProjects.filter((project) => project.status === "completed" || project.status === "cierre-por-sistema");
  const adminCancelledProjects = filteredProjects.filter((project) => project.status === "cancelled" || project.status === "no-autorizado");
  const adminPaidProjects = filteredProjects.filter((project) => project.paymentStatus === "paid");

  const supervisorProjects = filteredProjects;

  const selectedRequest = requests.find((request) => request.id === selectedRequestId);
  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  const unreadCount = visibleNotifications.filter((notification) => !notification.isRead).length;

  useEffect(() => {
    let cancelled = false;

    fetchAppState()
      .then((payload) => {
        if (cancelled) return;
        setUsers(normalizeUsers(payload.users.length > 0 ? payload.users : usersSeed));
        setProjects(payload.projects);
        setRequests(payload.requests);
        setNotifications(payload.notifications);
        // Merge dismissed date keys del servidor con los de localStorage
        if (payload.dismissedDateKeys && payload.dismissedDateKeys.length > 0) {
          setDismissedDateKeys(prev => {
            const merged = new Set(prev);
            payload.dismissedDateKeys!.forEach(k => merged.add(k));
            saveLocalSet(DISMISSED_DATE_KEYS_KEY, merged);
            return merged;
          });
        }
        // Merge read date keys del servidor con los de localStorage
        if (payload.readDateKeys && payload.readDateKeys.length > 0) {
          setReadDateKeys(prev => {
            const merged = new Set(prev);
            payload.readDateKeys!.forEach(k => merged.add(k));
            saveLocalSet(READ_DATE_KEYS_KEY, merged);
            return merged;
          });
        }
        setApiReady(true);
        // Guardar en caché local — "generador de emergencia" cuando el servidor no responde
        saveStateCache(payload);
        setCacheTimestamp(Date.now());
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof SessionRequiredError) {
          setShowLogin(true);
        } else {
          // Intentar cargar caché local antes de mostrar error
          const cached = loadStateCache();
          if (cached) {
            setUsers(normalizeUsers(cached.payload.users.length > 0 ? cached.payload.users : usersSeed));
            setProjects(cached.payload.projects);
            setRequests(cached.payload.requests);
            setNotifications(cached.payload.notifications);
            setCacheTimestamp(cached.ts);
            setIsOffline(true);
            setOfflineSince(new Date());
            // apiReady=false: no intentar guardar mientras offline
          } else {
            setApiReady(false);
            setToastMessage("Sin conexión al servidor y sin datos en caché");
          }
        }
      })
      .finally(() => {
        if (!cancelled) setHasHydrated(true);
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("projectra-sessions", JSON.stringify(signedInUserIds));

    if (activeUserId) {
      window.localStorage.setItem("projectra-active-user", activeUserId);
    } else {
      window.localStorage.removeItem("projectra-active-user");
    }
  }, [activeUserId, signedInUserIds]);

  useEffect(() => {
    if (signedInUserIds.length === 0) {
      setActiveUserId(null);
      return;
    }

    if (!activeUserId || !signedInUserIds.includes(activeUserId)) {
      setActiveUserId(signedInUserIds[0]);
    }
  }, [activeUserId, signedInUserIds]);

  // Sincroniza la sesión PHP con el usuario activo en UI.
  // Evita que operaciones de admin/supervisor fallen porque la sesión PHP
  // todavía apunta al último usuario que hizo login (p.ej. un ingeniero).
  useEffect(() => {
    if (!activeUserId || !apiReady) return;
    apiSwitchSession(activeUserId).catch(() => undefined);
  }, [activeUserId, apiReady]);

  // ── Tiempo real: iniciar polling al loguearse, detener al salir ──
  useEffect(() => {
    if (isLoggedOut || !apiReady) {
      realtime.stop();
      return;
    }
    realtime.start();

    const MUTATION_GRACE_MS = 8000;
    const withinGrace = () => Date.now() - lastMutationAt.current < MUTATION_GRACE_MS;
    // Grace por proyecto: solo bloquea el proyecto que esta sesión mutó — el resto se actualiza libre.
    const withinProjectGrace = (id: string) => {
      const ts = lastProjectMutationAt.current.get(id) ?? 0;
      return Date.now() - ts < MUTATION_GRACE_MS;
    };

    // Proyectos: actualizar existentes, agregar nuevos, quitar eliminados
    const unsubProjects = realtime.onProjectUpdate((updated, allIds) => {
      setProjects(prev => {
        const typedUpdated = updated as unknown as ProjectItem[];
        const grace = withinGrace();
        const allIdsSet = new Set(allIds);
        const permDeleted = permanentlyDeletedProjectIds.current;
        const softDeleted = softDeletedProjectIds.current;
        let changed = false;

        // Dentro del grace period no filtramos por allIds para no borrar ítems recién creados
        // localmente que aún no persistieron en el servidor.
        let result = prev;
        if (allIds.length > 0 && !grace) {
          // Auto-cleanup: si el servidor ya no reporta un ID que marcamos como permanentemente
          // borrado, el DELETE llegó al servidor — podemos limpiar el Set. Esto sustituye
          // el clearTimeout de 60s que podía liberar la protección antes de que el servidor confirmara.
          for (const id of [...permDeleted]) {
            if (!allIdsSet.has(id)) {
              permDeleted.delete(id);
            }
          }
          // Conservar: ítems en papelera (deletedAt) o que el servidor aún tiene.
          // Excluir: ítems borrados permanentemente aunque el servidor todavía los reporte
          // (ocurre durante los ~2s que tarda el DELETE en Hostinger).
          const filtered = prev.filter(p =>
            !permDeleted.has(p.id) && (p.deletedAt != null || allIdsSet.has(p.id))
          );
          if (filtered.length !== prev.length) { result = filtered; changed = true; }
        }
        if (typedUpdated.length > 0) {
          const existingIds = new Set(result.map(p => p.id));
          // Nuevos ítems: creados por otro usuario (ej. admin aprueba solicitud).
          // EXCLUIR explícitamente IDs borrados permanentemente en esta sesión —
          // sin esto, el polling los devuelve como "nuevos" mientras el DELETE llega al servidor.
          const newItems = typedUpdated.filter(u =>
            !existingIds.has(u.id) && !permDeleted.has(u.id)
          );
          const mapped = result.map(p => {
            const sv = typedUpdated.find(u => u.id === p.id);
            // Usar grace POR PROYECTO: así los cambios de otro usuario (admin↔engineer)
            // llegan de inmediato aunque esta sesión haya mutado otro proyecto recientemente.
            if (sv && sv !== p && !withinProjectGrace(p.id)) {
              // Race condition papelera: si el servidor devuelve la versión sin deletedAt
              // (la API aún no procesó el update), forzar nuestro deletedAt local.
              const pendingDeletedAt = softDeleted.get(p.id);
              if (pendingDeletedAt && !sv.deletedAt) {
                changed = true;
                return { ...sv, deletedAt: pendingDeletedAt };
              }
              changed = true;
              return sv;
            }
            return p;
          });
          if (changed || newItems.length > 0) {
            result = newItems.length > 0 ? [...mapped, ...newItems] : mapped;
            changed = true;
          }
        }
        return changed ? result : prev;
      });
    });

    // Solicitudes: actualizar existentes, agregar nuevas (ej. cuando admin aprueba)
    const unsubRequests = realtime.onRequestUpdate((updated, allIds) => {
      setRequests(prev => {
        const typedUpdated = updated as unknown as RequestItem[];
        const grace = withinGrace();
        const allIdsSet = new Set(allIds);
        const permDeleted = permanentlyDeletedRequestIds.current;
        let changed = false;

        // Mismo grace period: no eliminar localmente ítems no confirmados aún por el servidor.
        let result = prev;
        if (allIds.length > 0 && !grace) {
          // Auto-cleanup: si el servidor ya no reporta un ID permanentemente borrado, el DELETE
          // llegó — limpiar el Set. Mismo patrón que para proyectos.
          for (const id of [...permDeleted]) {
            if (!allIdsSet.has(id)) {
              permDeleted.delete(id);
            }
          }
          // Excluir solicitudes borradas permanentemente aunque el servidor las reporte aún.
          const filtered = prev.filter(r => !permDeleted.has(r.id) && allIdsSet.has(r.id));
          if (filtered.length !== prev.length) { result = filtered; changed = true; }
        }
        if (typedUpdated.length > 0) {
          const existingIds = new Set(result.map(r => r.id));
          // Nuevos ítems: excluir solicitudes borradas permanentemente en esta sesión.
          const newItems = typedUpdated.filter(u =>
            !existingIds.has(u.id) && !permDeleted.has(u.id)
          );
          const mapped = result.map(r => {
            const sv = typedUpdated.find(u => u.id === r.id);
            if (sv && sv !== r && !grace) { changed = true; return sv; }
            return r;
          });
          if (changed || newItems.length > 0) {
            result = newItems.length > 0 ? [...mapped, ...newItems] : mapped;
            changed = true;
          }
        }
        return changed ? result : prev;
      });
    });

    // Nuevas notificaciones en tiempo real
    const unsubNotifs = realtime.onNotification((newNotifs) => {
      const typed = newNotifs as unknown as NotificationItem[];
      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id));
        const fresh = typed.filter(n => !existingIds.has(n.id) && !deletedNotificationIds.current.has(n.id));
        return fresh.length > 0 ? [...fresh, ...prev] : prev;
      });
    });

    // ── Detección de conectividad ─────────────────────────────────────────────
    const unsubStatus = realtime.onStatus((online) => {
      setIsOffline(!online);
      if (!online) {
        setOfflineSince(new Date());
      } else {
        // Reconexión: refrescar datos desde servidor
        setOfflineSince(null);
        fetchAppState().then((payload) => {
          setUsers(normalizeUsers(payload.users.length > 0 ? payload.users : usersSeed));
          setProjects(payload.projects);
          setRequests(payload.requests);
          setNotifications(payload.notifications);
          saveStateCache(payload);
          setCacheTimestamp(Date.now());
        }).catch(() => undefined);
      }
    });

    return () => {
      unsubProjects();
      unsubRequests();
      unsubNotifs();
      unsubStatus();
    };
  }, [isLoggedOut, apiReady]);

  useEffect(() => {
    if (!hasHydrated || !apiReady) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      // save_state es ahora red de seguridad (full sync) — las mutaciones críticas usan
      // endpoints atómicos (update_project, update_request, create_request, etc.)
      saveAppState({ users, projects, requests, notifications }).catch((err: unknown) => {
        if (err instanceof SessionRequiredError) {
          // Sesión PHP expirada o desincronizada — forzar re-login
          logoutUser().catch(() => undefined);
          realtime.stop();
          setSignedInUserIds([]);
          setActiveUserId(null);
          setShowLogin(true);
          return;
        }
        // Error transiente — no desactivar apiReady, reintentar en el próximo cambio
        setToastMessage("No se pudo sincronizar con la base de datos");
      });
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [apiReady, hasHydrated, notifications, projects, requests, users]);

  const openProjectById = (projectId: string): void => {
    setSelectedProjectId(projectId);
  };

  const openRequestById = (requestId: string): void => {
    setSelectedRequestId(requestId);
  };

  const handleLogin = async (email: string, password: string): Promise<string | null> => {
    try {
      const result = await loginUser(email.trim(), password);
      const userId = result.user.id;
      setSignedInUserIds((current) => (current.includes(userId) ? current : [...current, userId]));
      setActiveUserId(userId);
      setLoginEmail("");
      setShowLogin(false);
      setSearchQuery("");
      setSelectedProjectId(null);
      setSelectedRequestId(null);
      setNewProjectOpen(false);
      setNewRequestOpen(false);
      if (!apiReady) {
        try {
          const payload = await fetchAppState();
          setUsers(normalizeUsers(payload.users.length > 0 ? payload.users : usersSeed));
          setProjects(payload.projects);
          setRequests(payload.requests);
          setNotifications(payload.notifications);
          setApiReady(true);
        } catch {
          // keep seed data; DB not reachable after login
        }
      }
      return null;
    } catch (err) {
      if (err instanceof Error && err.message && err.message !== "Credenciales incorrectas.") {
        return "No se pudo conectar con el servidor. Intenta de nuevo.";
      }
      return "Revisa el correo y la contrasena.";
    }
  };

  const handleLogout = (): void => {
    if (!activeUserId) {
      setShowLogin(true);
      return;
    }

    logoutUser().catch(() => undefined);
    setSignedInUserIds((current) => {
      const next = current.filter((userId) => userId !== activeUserId);
      setActiveUserId(next[0] ?? null);
      return next;
    });
    setSearchQuery("");
    setSelectedProjectId(null);
    setSelectedRequestId(null);
    setNewProjectOpen(false);
    setNewRequestOpen(false);
  };

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage(null);
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  useEffect(() => {
    if (!apiReady || activeRole !== "system_admin") {
      return;
    }

    fetchActivityLogs().then(setActivityLogs).catch(() => {
      setActivityLogs([]);
    });
  }, [apiReady, activeRole, projects, requests, users]);

  // Carga la info del contador de consecutivos cuando el gestor está activo
  useEffect(() => {
    if (!apiReady || activeRole !== "system_admin") return;
    apiGetSequenceInfo()
      .then(setSequenceInfo)
      .catch(() => undefined);
  }, [apiReady, activeRole]);

  const handleSetSequenceCounter = async (value: number): Promise<void> => {
    try {
      await apiSetSequenceCounter(value);
      const info = await apiGetSequenceInfo();
      setSequenceInfo(info);
      setToastMessage(`Consecutivo ajustado — el siguiente proyecto será #${info.display}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setToastMessage(`Error al ajustar consecutivo: ${msg}`);
    }
  };

  // Agrega una notificación al estado local y la persiste en la BD de forma inmediata
  const addNotification = (notif: NotificationItem): void => {
    setNotifications((current) => [notif, ...current]);
    if (apiReady) apiCreateNotification(notif).catch(() => undefined);
  };

  const handleMarkRead = (notificationId: string): void => {
    if (notificationId.startsWith("important-date-")) {
      const baseKey = notificationId.replace(/-\d{4}-\d{2}-\d{2}$/, "");
      setReadDateKeys(prev => {
        const next = new Set(prev);
        next.add(baseKey);
        saveLocalSet(READ_DATE_KEYS_KEY, next);
        return next;
      });
      // Tercera capa: actualizar el objeto del usuario para que save_state persista el key.
      setUsers(prev => prev.map(u => {
        if (u.id !== activeUser.id) return u;
        const keys = new Set(u.readNotifKeys ?? []);
        keys.add(baseKey);
        return { ...u, readNotifKeys: [...keys] };
      }));
      if (apiReady) apiUpdateNotifPrefs({ readDateKeys: [baseKey] }).catch(() => undefined);
    } else {
      setNotifications((current) =>
        current.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
      );
      // Tercera capa: persistir readNotifIds vía save_state.
      setUsers(prev => prev.map(u => {
        if (u.id !== activeUser.id) return u;
        const ids = new Set(u.readNotifIds ?? []);
        ids.add(notificationId);
        return { ...u, readNotifIds: [...ids] };
      }));
      if (apiReady) apiMarkNotificationRead(notificationId).catch(() => undefined);
    }
  };

  const handleCreateRequest = (payload: Omit<RequestItem, "id" | "createdAt" | "createdBy" | "status">): void => {
    const request: RequestItem = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      createdBy: activeUser.id,
      status: "under-review",
      ...payload,
    };

    lastMutationAt.current = Date.now();
    // Calcular nuevo estado inmediatamente para guardarlo sin esperar el debounce.
    // Sin esto, el polling (cada 4s) puede sobrescribir el state local antes de que
    // el save con debounce de 450ms alcance a completarse en el servidor.
    const updatedRequests = [request, ...requests];
    setRequests(updatedRequests);

    if (apiReady) {
      // Guardado atómico directo. Retries automáticos para cubrir cold-start de PHP en
      // hosting compartido (1ª petición puede tardar > timeout). 3 intentos: t=0, t+1.2s, t+3.5s.
      // ON DUPLICATE KEY UPDATE en el servidor garantiza idempotencia.
      apiCreateRequest(request).catch(() => {
        setTimeout(() => apiCreateRequest(request).catch(() => {
          setTimeout(() => apiCreateRequest(request).catch(() => undefined), 2300);
        }), 1200);
      });
    }

    addNotification({
      id: crypto.randomUUID(),
      role: "admin",
      title: "Nueva solicitud recibida",
      description: `${request.structuredName} ingresó para revisión administrativa.`,
      createdAt: new Date().toISOString(),
      isRead: false,
      relatedRequestId: request.id,
    });
    setEngineerTab("all");
  };

  const handleCreateProjectFromFieldUser = async (payload: {
    baseName: string;
    client: string;
    department: string;
    lugar?: string;
    type: ProjectItem["type"];
    description: string;
    totalContratado: number;
  }): Promise<void> => {
    lastMutationAt.current = Date.now();
    // Obtener consecutivo atómico del servidor — evita duplicados en creación concurrente
    let sequence: string;
    try {
      sequence = await apiNextSequence();
    } catch {
      // Fallback local si el servidor no responde (sin conexión)
      sequence = getNextSequence(requests, projects);
    }
    const now = new Date().toISOString();
    const structuredName = buildStructuredName({
      sequence,
      client: payload.client,
      department: payload.department,
      lugar: payload.lugar,
      type: payload.type,
      baseName: payload.baseName,
    });
    const project: ProjectItem = {
      id: crypto.randomUUID(),
      structuredName,
      baseName: payload.baseName,
      client: payload.client,
      department: payload.department,
      lugar: payload.lugar || undefined,
      type: payload.type,
      status: "en-programacion",
      paymentStatus: "unpaid",
      paymentLabel: "No pagado",
      priority: "medium",
      summary: "Proyecto dado de alta desde operación.",
      description: payload.description,
      totalContratado: payload.totalContratado,
      createdAt: now,
      updatedAt: now,
      createdBy: activeUser.id,
      participants: [activeUser.id],
      files: [],
      comments: [],
      importantDates: [],
      history: [
        {
          id: crypto.randomUUID(),
          createdAt: now,
          action: `Proyecto ${sequence} creado desde operación`,
          author: activeUser.name,
        },
      ],
      expenses: [],
      invoices: [],
    };
    const adminUserIds = users
      .filter((user) => user.role === "admin" || user.role === "system_admin")
      .map((user) => user.id);

    setProjects((current) => [project, ...current]);

    if (apiReady) {
      const persist = () => apiUpdateProject(project.id, project);
      persist().catch(() =>
        setTimeout(
          () => persist().catch((err) =>
            notifySaveError("El proyecto se creó localmente pero no se pudo guardar en el servidor", err),
          ),
          2000,
        ),
      );
    }
    addNotification({
      id: crypto.randomUUID(),
      role: "admin",
      userIds: adminUserIds,
      title: "Proyecto creado desde operación",
      description: `${activeUser.name} dio de alta ${structuredName}.`,
      createdAt: now,
      isRead: false,
      relatedProjectId: project.id,
    });
    setEngineerTab("all");
    setSelectedProjectId(project.id);
    setToastMessage(`Proyecto ${sequence} creado`);
  };

  const handleApproveRequest = async (requestId: string): Promise<void> => {
    lastMutationAt.current = Date.now();
    const requestToApprove = requests.find((request) => request.id === requestId);

    if (!requestToApprove) {
      return;
    }

    // Consecutivo atómico del servidor — evita duplicados si dos admins aprueban al mismo tiempo
    let serverSeq: string;
    try {
      serverSeq = await apiNextSequence();
    } catch {
      serverSeq = getNextSequence(requests, projects);
    }
    const nextSequence = serverSeq;
    const linkedProjectId = requestToApprove.linkedProjectId ?? crypto.randomUUID();
    const approvedStructuredName = requestToApprove.sequence
      ? requestToApprove.structuredName
      : buildStructuredName({
          sequence: nextSequence,
          client: requestToApprove.client,
          department: requestToApprove.department,
          type: requestToApprove.type,
          baseName: requestToApprove.baseName,
        });

    const now = new Date().toISOString();
    let newProject: ProjectItem | null = null;

    if (!requestToApprove.linkedProjectId) {
      newProject = {
        id: linkedProjectId,
        structuredName: approvedStructuredName,
        baseName: requestToApprove.baseName,
        client: requestToApprove.client,
        department: requestToApprove.department,
        lugar: requestToApprove.lugar || undefined,
        type: requestToApprove.type,
        status: "en-programacion",
        paymentStatus: "unpaid",
        paymentLabel: "No pagado",
        priority: "medium",
        summary: "Pendiente de programación administrativa.",
        description: requestToApprove.description,
        commitmentDate: undefined,
        startDate: undefined,
        endDate: undefined,
        createdAt: now,
        updatedAt: now,
        createdBy: requestToApprove.createdBy,
        participants: [requestToApprove.createdBy],
        totalContratado: 0,
        files: [],
        comments: [],
        expenses: [],
        fechaSolicitud: now,
        history: [
          {
            id: crypto.randomUUID(),
            createdAt: now,
            action: "Proyecto creado desde solicitud aprobada",
            author: activeUser.name,
          },
        ],
      };

      setProjects((current) => [newProject!, ...current]);
    }

    const approvedFields = {
      sequence: requestToApprove.sequence ?? nextSequence,
      structuredName: approvedStructuredName,
      status: "approved" as const,
      linkedProjectId,
      rejectionReason: undefined,
      correctionReason: undefined,
    };

    setRequests((current) =>
      current.map((request) =>
        request.id === requestId ? { ...request, ...approvedFields } : request,
      ),
    );

    // Guardados atómicos — no depender de save_state que en multi-usuario borra datos ajenos
    if (apiReady) {
      if (newProject) {
        apiUpdateProject(linkedProjectId, newProject).catch((err) =>
          notifySaveError("El proyecto se creó localmente pero no se pudo guardar en el servidor", err),
        );
      }
      apiUpdateRequest(requestId, approvedFields).catch((err) =>
        notifySaveError("No se pudo guardar la aprobación de la solicitud", err),
      );
    }

    addNotification({
      id: crypto.randomUUID(),
      role: "engineer" as const,
      userIds: [requestToApprove.createdBy],
      title: "Solicitud aprobada",
      description: `Tu solicitud ${approvedStructuredName} fue aprobada y el proyecto quedó en programación.`,
      createdAt: new Date().toISOString(),
      isRead: false,
      relatedRequestId: requestId,
      relatedProjectId: linkedProjectId,
    });
    setSelectedRequestId(null);
    setToastMessage("Solicitud aprobada");
  };

  const handleCorrectionRequest = (requestId: string, reason: string): void => {
    lastMutationAt.current = Date.now();
    const req = requests.find((r) => r.id === requestId);
    const correctionFields = { status: "needs-correction" as const, correctionReason: reason, rejectionReason: undefined };
    setRequests((current) =>
      current.map((request) => (request.id === requestId ? { ...request, ...correctionFields } : request)),
    );
    if (apiReady) {
      apiUpdateRequest(requestId, correctionFields).catch(() => undefined);
    }
    if (req) {
      addNotification({
        id: crypto.randomUUID(),
        role: "engineer" as const,
        userIds: [req.createdBy],
        title: "Solicitud requiere corrección",
        description: `Tu solicitud ${req.structuredName} necesita ajustes: ${reason}`,
        createdAt: new Date().toISOString(),
        isRead: false,
        relatedRequestId: requestId,
      });
    }
    setSelectedRequestId(null);
    setToastMessage("Solicitud enviada a corrección");
  };

  const handleRejectRequest = (requestId: string, reason: string): void => {
    lastMutationAt.current = Date.now();
    const req = requests.find((r) => r.id === requestId);
    const rejectedFields = { status: "rejected" as const, rejectionReason: reason, correctionReason: undefined };
    setRequests((current) =>
      current.map((request) => (request.id === requestId ? { ...request, ...rejectedFields } : request)),
    );
    if (apiReady) {
      apiUpdateRequest(requestId, rejectedFields).catch(() => undefined);
    }
    if (req) {
      addNotification({
        id: crypto.randomUUID(),
        role: "engineer" as const,
        userIds: [req.createdBy],
        title: "Solicitud rechazada",
        description: `Tu solicitud ${req.structuredName} fue rechazada: ${reason}`,
        createdAt: new Date().toISOString(),
        isRead: false,
        relatedRequestId: requestId,
      });
    }
    setSelectedRequestId(null);
    setToastMessage("Solicitud rechazada");
  };


  const handleReactivateRequest = (requestId: string): void => {
    const reactivatedFields = { status: "under-review" as const, rejectionReason: undefined, correctionReason: undefined };
    setRequests((current) =>
      current.map((r) => (r.id === requestId ? { ...r, ...reactivatedFields } : r)),
    );
    if (apiReady) {
      apiUpdateRequest(requestId, reactivatedFields).catch(() => undefined);
    }
    setToastMessage("Solicitud reactivada");
  };

  const handleResubmitRequest = async (
    requestId: string,
    correctedFields: Pick<import("@/types").RequestItem, "baseName" | "client" | "department" | "lugar" | "type" | "description" | "structuredName">,
  ): Promise<void> => {
    const req = requests.find((r) => r.id === requestId);
    const resubmitFields = {
      ...correctedFields,
      status: "under-review" as const,
      correctionReason: undefined,
      rejectionReason: undefined,
    };
    setRequests((current) =>
      current.map((r) => (r.id === requestId ? { ...r, ...resubmitFields } : r)),
    );
    if (apiReady) {
      try {
        await apiUpdateRequest(requestId, resubmitFields);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al reenviar";
        setToastMessage(`Error: ${msg}`);
        throw err;
      }
    }
    // Notificar a todos los admins que la solicitud corregida está lista para revisar
    if (req) {
      addNotification({
        id: crypto.randomUUID(),
        role: "admin" as const,
        title: "Solicitud corregida y reenviada",
        description: `${activeUser.name} corrigió y reenvió "${correctedFields.structuredName || req.structuredName}" — lista para nueva revisión.`,
        createdAt: new Date().toISOString(),
        isRead: false,
        relatedRequestId: requestId,
      });
    }
    setToastMessage("Solicitud reenviada para revisión");
    setEngineerTab("requests");
  };

  const handleUpdateProject = async (
    projectId: string,
    fields: Partial<ProjectItem> & { assignedEngineerId?: string },
  ): Promise<void> => {
    lastMutationAt.current = Date.now();
    lastProjectMutationAt.current.set(projectId, Date.now());
    const { assignedEngineerId, ...projectFields } = fields;
    const paymentLabelMap: Record<ProjectItem["paymentStatus"], string> = {
      unpaid: "No pagado",
      partial: "Pago parcial",
      paid: "Pagado",
    };
    const now = new Date().toISOString();

    // ── Lógica de asignación de ingeniero (necesita currentProject para la notificación) ──
    const currentProject = projects.find((p) => p.id === projectId);
    if (!currentProject) return;

    let newParticipants: string[] | null = null;
    let newCreatedBy: string | null = null;
    let pendingNotification: NotificationItem | null = null;

    if (assignedEngineerId) {
      const newEngineer = users.find(
        (u) => u.id === assignedEngineerId && u.role === "engineer",
      );
      if (newEngineer && newEngineer.id !== currentProject.createdBy) {
        newParticipants = Array.from(new Set([...currentProject.participants, newEngineer.id]));
        newCreatedBy = newEngineer.id;
        pendingNotification = {
          id: crypto.randomUUID(),
          role: "engineer",
          userIds: [newEngineer.id],
          title: "Nuevo proyecto asignado",
          description: `${activeUser.name} te asignó ${currentProject.structuredName}.`,
          createdAt: now,
          isRead: false,
          relatedProjectId: currentProject.id,
        };
      }
    }

    // ── Actualizar estado local usando functional updater ──
    // CRÍTICO: usar `p` (estado fresco del callback), NO `currentProject` (closure vieja).
    // Si handleUploadFile y handleUpdateProject se llaman en el mismo tick de microtasks
    // (ej. upload → status change "en-revision"), la closure tiene el proyecto SIN el archivo
    // recién subido. Con el functional updater React aplica los cambios sobre el estado más
    // reciente, preservando los archivos que otro setProjects acaba de agregar.
    setProjects((current) => current.map((p) => {
      if (p.id !== projectId) return p;
      return {
        ...p,                // ← estado fresco (tiene archivos nuevos si el upload ya corrió)
        ...projectFields,
        ...(projectFields.paymentStatus
          ? { paymentLabel: paymentLabelMap[projectFields.paymentStatus] }
          : {}),
        ...(newParticipants !== null ? { participants: newParticipants } : {}),
        ...(newCreatedBy !== null ? { createdBy: newCreatedBy } : {}),
        updatedAt: now,
        history: [
          { id: crypto.randomUUID(), createdAt: now, action: "Proyecto actualizado", author: activeUser.name },
          ...p.history,      // ← historial fresco también
        ],
      };
    }));

    // ── Guardado atómico en BD: SOLO los campos cambiados ──
    // Enviar el proyecto COMPLETO causaba race condition: si el upload corrió primero en local
    // pero no en la closure, apiUpdateProject sobrescribía la BD con la lista de archivos vieja.
    // Al enviar solo los campos modificados, el PHP hace array_merge y preserva los archivos.
    if (apiReady) {
      const atomicFields: Partial<ProjectItem> = {
        ...projectFields,
        ...(projectFields.paymentStatus
          ? { paymentLabel: paymentLabelMap[projectFields.paymentStatus] }
          : {}),
        ...(newParticipants !== null ? { participants: newParticipants } : {}),
        ...(newCreatedBy !== null ? { createdBy: newCreatedBy } : {}),
        updatedAt: now,
      };
      try {
        await apiUpdateProject(projectId, atomicFields);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        setToastMessage(`Error al guardar: ${msg}`);
        throw err;
      }
    }

    if (pendingNotification) {
      addNotification(pendingNotification as NotificationItem);
    }

    // ── Notificaciones de aprobación/rechazo de archivos ──
    const FILE_STATUS_FIELDS = [
      { key: "fotosStatus", label: "Fotos de evidencia" },
      { key: "estimacionFileStatus", label: "Estimación" },
      { key: "cotizacionFileStatus", label: "Cotización" },
      { key: "reporteFileStatus", label: "Reporte" },
      { key: "otrosFileStatus", label: "Otros documentos" },
    ] as const;
    const engineerToNotify = newCreatedBy ?? currentProject.createdBy;
    for (const { key, label } of FILE_STATUS_FIELDS) {
      const newStatus = (projectFields as Record<string, unknown>)[key];
      if ((newStatus === "si" || newStatus === "rechazado") && engineerToNotify) {
        addNotification({
          id: crypto.randomUUID(),
          role: "engineer",
          userIds: [engineerToNotify],
          title: newStatus === "si" ? "Archivos aprobados" : "Archivos rechazados",
          description: `${label} de ${currentProject.structuredName} ${newStatus === "si" ? "fueron aprobados" : "fueron rechazados"}.`,
          createdAt: now,
          isRead: false,
          relatedProjectId: currentProject.id,
        });
      }
    }
  };

  const handleMessageSent = (projectId: string, authorId: string, authorName: string, message: string, isPriority: boolean): void => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    // Construir lista de destinatarios: todos los involucrados en el proyecto excepto el remitente
    const involvedIds = new Set([project.createdBy, ...project.participants]);
    const adminIds = users
      .filter((u) => u.role === "admin" || u.role === "system_admin")
      .map((u) => u.id);
    const recipientIds = [...new Set([...involvedIds, ...adminIds])].filter((id) => id !== authorId);

    if (recipientIds.length === 0) return;

    const preview = message.length > 60 ? `${message.slice(0, 60)}…` : message;
    addNotification({
      id: crypto.randomUUID(),
      role: "admin" as const,
      userIds: recipientIds,
      title: `${isPriority ? "⚑ " : ""}Mensaje en ${project.structuredName ?? project.baseName}`,
      description: `${authorName}: ${preview}`,
      createdAt: new Date().toISOString(),
      isRead: false,
      relatedProjectId: projectId,
    });
  };

  const handleAddComment = (projectId: string, message: string, isPriority: boolean, authorId: string): void => {
    const now = new Date().toISOString();
    const newComment = { id: crypto.randomUUID(), authorId, message, createdAt: now, isPriority };
    const histEntry  = {
      id: crypto.randomUUID(),
      createdAt: now,
      action: isPriority ? "Se agregó comentario prioritario" : "Se agregó comentario",
      author: activeUser.name,
    };

    // Actualización optimista local
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? { ...project, updatedAt: now, comments: [newComment, ...project.comments], history: [histEntry, ...project.history] }
          : project,
      ),
    );

    // Append atómico en BD — no puede sobreescribir comentarios paralelos de otro usuario
    if (apiReady) {
      apiAddProjectComment(projectId, newComment, histEntry).catch(() => undefined);
    }
  };

  const handleAddExpense = (
    projectId: string,
    expense: Omit<import("@/types").ProjectExpenseItem, "id" | "createdAt" | "creadoPor">,
  ): void => {
    const now = new Date().toISOString();
    const newExpense: import("@/types").ProjectExpenseItem = {
      ...expense,
      id: crypto.randomUUID(),
      creadoPor: activeUser.id,
      createdAt: now,
    };
    const histEntry = {
      id: crypto.randomUUID(),
      createdAt: now,
      action: `Gasto registrado: ${expense.titulo} (${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(expense.monto)})`,
      author: activeUser.name,
    };

    // Actualización optimista local
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              updatedAt: now,
              expenses: [...project.expenses, newExpense],
              history: [histEntry, ...project.history],
            }
          : project,
      ),
    );

    // Append atómico en BD — no sobreescribe gastos paralelos de otro usuario
    if (apiReady) {
      apiAddProjectExpense(projectId, newExpense, histEntry).catch(() => undefined);
    }
  };

  const handleDeleteExpense = (projectId: string, expenseId: string): void => {
    const now = new Date().toISOString();

    // Actualización optimista local
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              updatedAt: now,
              expenses: project.expenses.filter((e) => e.id !== expenseId),
              history: [
                { id: crypto.randomUUID(), createdAt: now, action: "Gasto eliminado", author: activeUser.name },
                ...project.history,
              ],
            }
          : project,
      ),
    );

    // Eliminación atómica en BD — array_filter directo en el nodo expenses
    if (apiReady) {
      apiDeleteProjectExpense(projectId, expenseId).catch(() => undefined);
    }
  };

  // totalContratado se edita directamente en F1 del dialog a través de handleUpdateProject.
  // handleUpdateBudget fue eliminado — era redundante con handleUpdateProject.

  const handleAddProjectImportantDate = (
    projectId: string,
    payload: { title: string; date: string },
  ): void => {
    lastMutationAt.current = Date.now();
    lastProjectMutationAt.current.set(projectId, Date.now());
    const now = new Date().toISOString();
    const currentProject = projects.find((p) => p.id === projectId);
    if (!currentProject) return;

    const newDate = {
      id: crypto.randomUUID(),
      title: payload.title,
      date: payload.date,
      createdBy: activeUser.id,
      createdAt: now,
    };
    const updatedImportantDates = [...(currentProject.importantDates ?? []), newDate];

    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              updatedAt: now,
              importantDates: updatedImportantDates,
              history: [
                { id: crypto.randomUUID(), createdAt: now, action: "Se agregó fecha importante al calendario", author: activeUser.name },
                ...project.history,
              ],
            }
          : project,
      ),
    );

    // Guardado atómico — envía el array completo actualizado (append ya fue hecho localmente)
    if (apiReady) {
      apiUpdateProject(projectId, { importantDates: updatedImportantDates, updatedAt: now }).catch((err) =>
        notifySaveError("No se pudo guardar la fecha importante", err),
      );
    }
  };

  const handleDeleteImportantDate = (projectId: string, dateId: string): void => {
    lastMutationAt.current = Date.now();
    lastProjectMutationAt.current.set(projectId, Date.now());
    const now = new Date().toISOString();
    const currentProject = projects.find((p) => p.id === projectId);
    if (!currentProject) return;
    const updatedDates = (currentProject.importantDates ?? []).filter((d) => d.id !== dateId);
    setProjects((current) =>
      current.map((p) =>
        p.id === projectId ? { ...p, updatedAt: now, importantDates: updatedDates } : p,
      ),
    );
    if (apiReady) {
      apiUpdateProject(projectId, { importantDates: updatedDates, updatedAt: now }).catch((err) =>
        notifySaveError("No se pudo eliminar la fecha importante", err),
      );
    }
  };

  const roleLabels: Record<RoleKey, string> = {
    engineer: "Ingeniero",
    admin: "Administracion",
    supervisor: "Supervisor",
    system_admin: "Gestor del sistema",
  };

  const handleCreateUser = (
    payload: Omit<UserItem, "id" | "name" | "avatar" | "roleLabel" | "isActive" | "createdAt" | "updatedAt">,
  ): void => {
    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const fullName = `${payload.firstName ?? ""} ${payload.lastName ?? ""}`.trim();
    const initials =
      fullName
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "US";

    const { password, ...payloadWithoutPassword } = payload as typeof payload & { password?: string };

    const newUser: UserItem = {
      ...payloadWithoutPassword,
      id: userId,
      name: fullName,
      avatar: initials,
      roleLabel: roleLabels[payload.role],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    setUsers((current) => [newUser, ...current]);
    setToastMessage("Usuario creado");

    void apiCreateUser({ ...newUser, password: password ?? "ASBT2026!" }).catch(() => undefined);
  };

  const handleUpdateUser = (
    userId: string,
    payload: Pick<UserItem, "firstName" | "lastName" | "email" | "department" | "role" | "isActive" | "password">,
  ): void => {
    const fullName = `${payload.firstName ?? ""} ${payload.lastName ?? ""}`.trim();
    const initials =
      fullName
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "US";

    const { password, ...payloadWithoutPassword } = payload;

    setUsers((current) =>
      current.map((user) =>
        user.id === userId
          ? {
              ...user,
              ...payloadWithoutPassword,
              name: fullName || user.name,
              avatar: initials,
              roleLabel: roleLabels[payload.role],
              updatedAt: new Date().toISOString(),
            }
          : user,
      ),
    );
    setToastMessage("Usuario actualizado");

    void apiUpdateUser(userId, { ...payloadWithoutPassword, ...(password ? { password } : {}) }).catch(() => undefined);
  };

  const handleDeleteUser = async (userId: string): Promise<void> => {
    if (userId === activeUser.id) {
      setToastMessage("No puedes eliminar tu propia cuenta activa");
      return;
    }

    if (apiReady) {
      try {
        await apiDeleteUser(userId);
      } catch {
        setToastMessage("No se pudo eliminar el usuario en la base de datos");
        return;
      }
    }

    setUsers((current) => current.filter((user) => user.id !== userId));
    setProjects((current) =>
      current.map((project) => ({
        ...project,
        participants: project.participants.filter((participantId) => participantId !== userId),
      })),
    );
    setToastMessage("Usuario eliminado");
  };

  const handleCreateProjectFromAdmin = (
    payload: {
      sequence: string;
      baseName: string;
      client: string;
      department: string;
      lugar?: string;
      type: ProjectItem["type"];
      description: string;
      status: ProjectItem["status"];
      paymentStatus: ProjectItem["paymentStatus"];
      tipoPago: ProjectItem["tipoPago"];
      priority: ProjectItem["priority"];
      totalContratado: number;
      assignedEngineerId?: string;
    },
  ): void => {
    lastMutationAt.current = Date.now();
    const sequence = payload.sequence.padStart(4, "0");
    const sequenceExists = projects.some((project) => getProjectSequence(project) === sequence);

    if (sequenceExists) {
      setToastMessage(`Ya existe el proyecto ${sequence}`);
      return;
    }

    const now = new Date().toISOString();
    const paymentLabelMap: Record<ProjectItem["paymentStatus"], string> = {
      unpaid: "No pagado",
      partial: "Pago parcial",
      paid: "Pagado",
    };
    const assignedEngineer = payload.assignedEngineerId
      ? users.find((user) => user.id === payload.assignedEngineerId && user.role === "engineer")
      : undefined;
    const adminUserIds = users.filter((user) => user.role === "admin").map((user) => user.id);
    const structuredName = buildStructuredName({
      sequence,
      client: payload.client,
      department: payload.department,
      lugar: payload.lugar,
      type: payload.type,
      baseName: payload.baseName,
    });

    const project: ProjectItem = {
      id: crypto.randomUUID(),
      structuredName,
      baseName: payload.baseName,
      client: payload.client,
      department: payload.department,
      lugar: payload.lugar || undefined,
      type: payload.type,
      status: payload.status,
      paymentStatus: payload.paymentStatus,
      paymentLabel: paymentLabelMap[payload.paymentStatus],
      tipoPago: payload.tipoPago,
      priority: payload.priority,
      summary: "Proyecto dado de alta por Gestor del sistema.",
      description: payload.description,
      totalContratado: payload.totalContratado,
      createdAt: now,
      updatedAt: now,
      createdBy: assignedEngineer?.id ?? activeUser.id,
      participants: assignedEngineer ? [assignedEngineer.id] : [],
      files: [],
      comments: [],
      importantDates: [],
      history: [
        {
          id: crypto.randomUUID(),
          createdAt: now,
          action: `Proyecto ${sequence} dado de alta manualmente`,
          author: activeUser.name,
        },
        {
          id: crypto.randomUUID(),
          createdAt: now,
          action: assignedEngineer ? `Ingeniero asignado: ${assignedEngineer.name}` : "Proyecto creado sin ingeniero asignado",
          author: activeUser.name,
        },
      ],
      expenses: [],
      invoices: [],
    };

    setProjects((current) => [project, ...current]);

    // Persistencia atómica inmediata — no depender del debounce de save_state.
    // Si el gestor navega o recarga antes de los 3 s, el proyecto queda en BD.
    if (apiReady) {
      const persist = () => apiUpdateProject(project.id, project);
      persist().catch(() =>
        setTimeout(
          () => persist().catch((err) =>
            notifySaveError("El proyecto se creó localmente pero no se pudo guardar en el servidor", err),
          ),
          2000,
        ),
      );
    }

    if (assignedEngineer) {
      addNotification({
        id: crypto.randomUUID(),
        role: "engineer" as const,
        userIds: [assignedEngineer.id],
        title: "Nuevo proyecto asignado",
        description: `${activeUser.name} te asigno ${structuredName}.`,
        createdAt: now,
        isRead: false,
        relatedProjectId: project.id,
      });
    }
    addNotification({
      id: crypto.randomUUID(),
      role: "admin" as const,
      userIds: adminUserIds,
      title: assignedEngineer ? "Proyecto creado y asignado" : "Proyecto pendiente de asignacion",
      description: assignedEngineer
        ? `${structuredName} fue creado por ${activeUser.name} y asignado a ${assignedEngineer.name}.`
        : `${structuredName} fue creado por ${activeUser.name}. Asignale un ingeniero.`,
      createdAt: now,
      isRead: false,
      relatedProjectId: project.id,
    });
    setToastMessage(`Proyecto ${sequence} creado`);
    // Subir el contador hasta este folio para que next_sequence no genere duplicados.
    // Retry incluido: si Hostinger corta la conexión, el segundo intento lo corrige.
    if (apiReady) {
      const bump = () => apiBumpSequence(Number.parseInt(sequence, 10));
      bump().catch(() => setTimeout(() => bump().catch(() => undefined), 2000));
    }
  };

  const handleCreateRequestFromAdmin = (
    payload: {
      baseName: string;
      client: string;
      department: string;
      type: RequestItem["type"];
      description: string;
      createdBy: string;
      status: RequestItem["status"];
    },
  ): void => {
    const request: RequestItem = {
      id: crypto.randomUUID(),
      structuredName: buildStructuredName({
        sequence: "SOL",
        client: payload.client,
        department: payload.department,
        type: payload.type,
        baseName: payload.baseName,
      }),
      baseName: payload.baseName,
      client: payload.client,
      department: payload.department,
      type: payload.type,
      description: payload.description,
      status: payload.status,
      createdAt: new Date().toISOString(),
      createdBy: payload.createdBy,
    };

    setRequests((current) => [request, ...current]);
    setToastMessage("Solicitud creada");
  };

  const handleDeleteRequest = async (requestId: string): Promise<void> => {
    if (apiReady) {
      try {
        await apiDeleteRequest(requestId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        // Si es error de permisos, detener; si es "no encontrada" u otro, continuar y limpiar del estado local
        if (err instanceof SessionRequiredError || msg.toLowerCase().includes("acceso") || msg.toLowerCase().includes("autenticado")) {
          setToastMessage(`Sin permiso para eliminar: ${msg}`);
          return;
        }
        // Para cualquier otro error (incluyendo 404 en datos huérfanos), continuar con la eliminación local
      }
    }

    lastMutationAt.current = Date.now();
    // Registrar como eliminada permanentemente: evita que el polling la re-agregue.
    // El auto-cleanup del Set ocurre cuando el poll confirma que el servidor ya no la reporta.
    // Timeout de 5 min como respaldo (igual que en handlePermanentDeleteProject).
    permanentlyDeletedRequestIds.current.add(requestId);
    window.setTimeout(() => permanentlyDeletedRequestIds.current.delete(requestId), 300_000);
    setRequests((current) => current.filter((request) => request.id !== requestId));
    setSelectedRequestId(null);
    setToastMessage("Solicitud eliminada");
  };

  const handleAddInvoice = (
    projectId: string,
    invoice: Omit<import("@/types").InvoiceItem, "id" | "createdAt" | "createdBy">,
  ): void => {
    const now = new Date().toISOString();
    const newInvoice: import("@/types").InvoiceItem = {
      ...invoice,
      id: crypto.randomUUID(),
      createdAt: now,
      createdBy: activeUser.id,
    };
    const histEntry = {
      id: crypto.randomUUID(),
      createdAt: now,
      action: `Factura solicitada — OC: ${invoice.oc}`,
      author: activeUser.name,
    };

    // Actualización optimista local
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              updatedAt: now,
              invoices: [...(project.invoices ?? []), newInvoice],
              history: [histEntry, ...project.history],
            }
          : project,
      ),
    );

    // Append atómico en BD — no sobreescribe facturas paralelas de otro usuario
    if (apiReady) {
      apiAddProjectInvoice(projectId, newInvoice, histEntry).catch(() => undefined);
    }
  };

  const handleUpdateInvoice = (
    projectId: string,
    invoiceId: string,
    updates: Partial<import("@/types").InvoiceItem>,
  ): void => {
    const now = new Date().toISOString();

    // Actualización optimista local
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              updatedAt: now,
              invoices: (project.invoices ?? []).map((invoice) =>
                invoice.id === invoiceId ? { ...invoice, ...updates } : invoice,
              ),
              history: [
                {
                  id: crypto.randomUUID(),
                  createdAt: now,
                  action: `Factura actualizada${updates.status ? ` → ${updates.status}` : ""}`,
                  author: activeUser.name,
                },
                ...project.history,
              ],
            }
          : project,
      ),
    );

    // Merge quirúrgico en BD — solo toca el nodo de esa factura, no el array completo
    if (apiReady) {
      apiUpdateProjectInvoice(projectId, invoiceId, updates).catch(() => undefined);
    }
  };

  const handleUploadFile = async (projectId: string, file: File, category?: import("@/types").FileCategory): Promise<void> => {
    const now = new Date().toISOString();
    // Marcar mutación ANTES del await para que el grace period cubra el polling
    // que pueda llegar mientras el archivo se está subiendo al servidor.
    lastMutationAt.current = Date.now();
    lastProjectMutationAt.current.set(projectId, Date.now());

    try {
      const fileItem = await uploadFile(projectId, file, category);
      const newFileItem: import("@/types").ProjectFileItem = { ...fileItem, category };

      // Renovar el grace period al completar el upload
      lastMutationAt.current = Date.now();
      lastProjectMutationAt.current.set(projectId, Date.now());

      // ── Agregar archivo al estado local usando functional updater ──
      // NOTA: el archivo ya fue guardado atómicamente en la BD por upload_file (PHP),
      // así que NO necesitamos llamar apiUpdateProject({ files: [...] }) aquí.
      // Eso eliminaba el race condition donde uploads sucesivos se sobreescribían en BD.
      setProjects((current) =>
        current.map((project) => {
          if (project.id !== projectId) return project;
          return {
            ...project,
            updatedAt: now,
            files: [...project.files, newFileItem],
            history: [
              { id: crypto.randomUUID(), createdAt: now, action: `Archivo subido: ${file.name}`, author: activeUser.name },
              ...project.history,
            ],
          };
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al subir el archivo";
      setToastMessage(`Error: ${msg}`);
    }
  };

  const handleDeleteFile = async (projectId: string, fileId: string, category: import("@/types").FileCategory): Promise<void> => {
    const now = new Date().toISOString();
    lastMutationAt.current = Date.now();
    lastProjectMutationAt.current.set(projectId, Date.now());

    // Calcular si este es el último archivo de su sección ANTES del setState (para usarlo fuera)
    const currentProject = projects.find((p) => p.id === projectId);
    const filesAfterDelete = currentProject ? currentProject.files.filter((f) => f.id !== fileId) : [];
    const remainingInCat = filesAfterDelete.filter((f) => {
      const cat: import("@/types").FileCategory = f.category ?? (/\.(png|jpg|jpeg|gif|webp)$/i.test(f.name) ? "fotos" : "reporte");
      return cat === category;
    });
    const isLastInCategory = remainingInCat.length === 0;

    // Mapeo correcto de categoría → campo de status (bug fix: "otros" → otrosFileStatus)
    const statusFieldMap: Record<import("@/types").FileCategory, keyof import("@/types").ProjectItem> = {
      fotos:      "fotosStatus",
      estimacion: "estimacionFileStatus",
      cotizacion: "cotizacionFileStatus",
      reporte:    "reporteFileStatus",
      otros:      "otrosFileStatus",
    };

    setProjects((current) =>
      current.map((project) => {
        if (project.id !== projectId) return project;
        const newFiles = project.files.filter((f) => f.id !== fileId);
        const resetFields: Partial<import("@/types").ProjectItem> = isLastInCategory
          ? { [statusFieldMap[category]]: "no" }
          : {};
        return {
          ...project,
          files: newFiles,
          updatedAt: now,
          ...resetFields,
          history: [
            { id: crypto.randomUUID(), createdAt: now, action: "Archivo eliminado", author: activeUser.name },
            ...project.history,
          ],
        };
      }),
    );

    if (apiReady) {
      apiDeleteFile(fileId, projectId).catch((err) =>
        notifySaveError("No se pudo eliminar el archivo en el servidor", err),
      );
      // Cuando se borra el último archivo de una sección, resetear el status atómicamente
      // para que otros usuarios vean el cambio de inmediato (no esperar save_state 3s).
      if (isLastInCategory) {
        apiUpdateProject(projectId, { [statusFieldMap[category]]: "no" } as Partial<import("@/types").ProjectItem>).catch((err) =>
          notifySaveError("No se pudo actualizar el estado de la sección", err),
        );
      }
    }
  };

  const handleDeleteProject = (projectId: string): void => {
    lastMutationAt.current = Date.now();
    const deletedAt = new Date().toISOString();
    // Registrar en rastreador de papelera: evita race condition post-grace donde el polling
    // devuelve la versión sin deletedAt antes de que el servidor procese el update.
    softDeletedProjectIds.current.set(projectId, deletedAt);
    setTimeout(() => softDeletedProjectIds.current.delete(projectId), 30_000);
    setProjects((current) =>
      current.map((p) => p.id === projectId ? { ...p, deletedAt } : p),
    );
    setSelectedProjectId(null);
    setToastMessage("Proyecto movido a la papelera");
    // Guardado atómico inmediato: marca deletedAt en BD sin esperar save_state.
    if (apiReady) {
      apiUpdateProject(projectId, { deletedAt }).catch((err) =>
        notifySaveError("El proyecto se movió a la papelera localmente pero no se pudo guardar en el servidor", err),
      );
    }
  };

  const handleRestoreProject = (projectId: string): void => {
    lastMutationAt.current = Date.now();
    // Al restaurar, limpiar el rastreador de papelera para que el polling no fuerce deletedAt.
    softDeletedProjectIds.current.delete(projectId);
    setProjects((current) =>
      current.map((p) => p.id === projectId ? { ...p, deletedAt: undefined } : p),
    );
    setToastMessage("Proyecto restaurado");
    // Limpiar deletedAt en BD atómicamente
    if (apiReady) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiUpdateProject(projectId, { deletedAt: null } as any).catch((err) =>
        notifySaveError("El proyecto se restauró localmente pero no se pudo guardar en el servidor", err),
      );
    }
  };

  const handlePermanentDeleteProject = (projectId: string): void => {
    lastMutationAt.current = Date.now();
    // Capturar el proyecto antes de eliminarlo del estado — necesario para rollback si falla la API.
    const projectSnapshot = projects.find((p) => p.id === projectId);
    // Registrar como eliminado permanentemente: evita que el polling lo re-agregue.
    // El auto-cleanup del Set ocurre cuando el poll confirma que el servidor ya no lo reporta.
    // Timeout de 5 min como respaldo por si el polling no llega (sin conexión, pestaña inactiva).
    permanentlyDeletedProjectIds.current.add(projectId);
    softDeletedProjectIds.current.delete(projectId);
    const fallbackTimer = window.setTimeout(
      () => permanentlyDeletedProjectIds.current.delete(projectId),
      300_000, // 5 minutos — solo fallback
    );
    setProjects((current) => current.filter((p) => p.id !== projectId));
    setRequests((current) =>
      current.map((r) => r.linkedProjectId === projectId ? { ...r, linkedProjectId: undefined } : r),
    );
    setSelectedProjectId(null);
    setToastMessage("Proyecto eliminado permanentemente");
    if (apiReady) {
      apiDeleteProject(projectId).catch(() => {
        // El DELETE falló — revertir para que el usuario vea el proyecto y pueda reintentar.
        window.clearTimeout(fallbackTimer);
        permanentlyDeletedProjectIds.current.delete(projectId);
        if (projectSnapshot) {
          setProjects((prev) =>
            prev.find((p) => p.id === projectId) ? prev : [projectSnapshot, ...prev],
          );
        }
        setToastMessage("Error al eliminar el proyecto. Inténtalo de nuevo.");
      });
    }
  };

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  if (isLoggedOut) {
    return (
      <LoginView
        onLogin={handleLogin}
        initialEmail={loginEmail}
      />
    );
  }

  return (
    <div className="dashboard-shell gap-6">
      {/* ── Banner "sin conexión" — generador de emergencia ── */}
      {isOffline && (
        <div className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-between gap-3 bg-[#1A0A00] px-4 py-2.5 text-sm shadow-lg border-b border-[#F5A524]/30">
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#F5A524] animate-pulse" />
            <span className="font-semibold text-[#F5A524]">Sistema sin conexión</span>
            <span className="text-[#A1A1AA]">
              — mostrando datos guardados
              {cacheTimestamp ? ` del ${new Date(cacheTimestamp).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
              .{" "}Los cambios no se guardarán hasta que el servidor responda.
            </span>
          </div>
          <span className="shrink-0 text-xs text-[#52525B]">
            {offlineSince ? `Sin conexión desde ${offlineSince.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
        </div>
      )}
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        unreadCount={unreadCount}
        activeUser={activeUser}
        accounts={signedInAccounts}
        onAccountChange={(userId) => {
          if (userId !== activeUserId) {
            // PHP solo soporta una sesión: cerrar la actual y pedir login del usuario seleccionado
            const targetUser = users.find((u) => u.id === userId);
            logoutUser().catch(() => undefined);
            realtime.stop();
            setLoginEmail(targetUser?.email ?? "");
            setSignedInUserIds([]);
            setActiveUserId(null);
            setShowLogin(true);
            return;
          }
          setSearchQuery("");
          setSelectedProjectId(null);
          setSelectedRequestId(null);
          setNewProjectOpen(false);
          setNewRequestOpen(false);
        }}
        onAddAccount={() => setShowLogin(true)}
        onLogout={handleLogout}
        notifications={visibleNotifications}
        onMarkAllRead={() => {
          setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
          // Marcar como leídas también las notificaciones de fecha visibles
          const next = new Set(readDateKeys);
          const newDateKeys: string[] = [];
          dueImportantDateNotifications.forEach((n) => {
            const k = n.id.replace(/-\d{4}-\d{2}-\d{2}$/, "");
            if (!next.has(k)) { next.add(k); newDateKeys.push(k); }
          });
          setReadDateKeys(next);
          saveLocalSet(READ_DATE_KEYS_KEY, next);
          if (newDateKeys.length > 0) {
            // Tercera capa: persistir vía save_state actualizando el usuario en state.
            setUsers(prev => prev.map(u => {
              if (u.id !== activeUser.id) return u;
              const keys = new Set(u.readNotifKeys ?? []);
              newDateKeys.forEach(k => keys.add(k));
              return { ...u, readNotifKeys: [...keys] };
            }));
          }
          if (apiReady) {
            apiMarkAllNotificationsRead().catch(() => undefined);
            if (newDateKeys.length > 0) apiUpdateNotifPrefs({ readDateKeys: newDateKeys }).catch(() => undefined);
          }
        }}
        onMarkRead={handleMarkRead}
        onDeleteNotification={(id) => {
          if (id.startsWith("important-date-")) {
            const baseKey = id.replace(/-\d{4}-\d{2}-\d{2}$/, "");
            const next = new Set(dismissedDateKeys);
            next.add(baseKey);
            setDismissedDateKeys(next);
            saveLocalSet(DISMISSED_DATE_KEYS_KEY, next);
            // Tercera capa: actualizar el objeto del usuario en `users` para que
            // save_state persista el key aunque apiUpdateNotifPrefs falle.
            setUsers(prev => prev.map(u => {
              if (u.id !== activeUser.id) return u;
              const keys = new Set(u.dismissedNotifKeys ?? []);
              keys.add(baseKey);
              return { ...u, dismissedNotifKeys: [...keys] };
            }));
            if (apiReady) apiUpdateNotifPrefs({ dismissedDateKeys: [baseKey] }).catch(() => undefined);
          } else {
            // Notificación regular (UUID): tercera capa vía save_state.
            setUsers(prev => prev.map(u => {
              if (u.id !== activeUser.id) return u;
              const ids = new Set(u.dismissedNotifIds ?? []);
              ids.add(id);
              return { ...u, dismissedNotifIds: [...ids] };
            }));
          }
          // Registrar antes de limpiar: evita que el polling la re-agregue en los próximos 4s
          deletedNotificationIds.current.add(id);
          window.setTimeout(() => { deletedNotificationIds.current.delete(id); }, 30_000);
          // Siempre limpiar del estado local y de BD (puede haber quedado persistida por versión anterior)
          setNotifications((prev) => prev.filter((n) => n.id !== id));
          if (apiReady) apiDeleteNotification(id).catch(() => undefined);
        }}
        onNavigateTo={(projectId, requestId) => {
          if (projectId) setSelectedProjectId(projectId);
          if (requestId) setSelectedRequestId(requestId);
        }}
      />

      {activeRole === "engineer" ? (
        <EngineerView
          tab={engineerTab}
          onTabChange={setEngineerTab}
          activeUserName={activeUser.name}
          projects={engineerCalendarProjects}
          requests={engineerRequests}
          onOpenProject={openProjectById}
          onOpenNewRequest={() => setNewRequestOpen(true)}
          onResubmitRequest={handleResubmitRequest}
          onDeleteImportantDate={handleDeleteImportantDate}
        />
      ) : null}

      {isAdminArea ? (
        <AdminView
          tab={adminTab}
          onTabChange={setAdminTab}
          activeUserName={activeUser.name}
          reviewRequests={adminReviewRequests}
          activeProjects={adminActiveProjects}
          completedProjects={adminCompletedProjects}
          cancelledProjects={adminCancelledProjects}
          paidProjects={adminPaidProjects}
          rejectedRequests={adminRejectedRequests}
          correctionRequests={adminCorrectionRequests}
          projects={projects}
          requests={filteredRequests}
          users={users}
          activityLogs={activityLogs}
          canManageUsers={activeRole === "system_admin"}
          sequenceInfo={sequenceInfo}
          onSetSequenceCounter={handleSetSequenceCounter}
          onCreateProject={handleCreateProjectFromAdmin}
          onDeleteProject={handleDeleteProject}
          onRestoreProject={handleRestoreProject}
          onPermanentDeleteProject={handlePermanentDeleteProject}
          onCreateRequest={handleCreateRequestFromAdmin}
          onDeleteRequest={handleDeleteRequest}
          onCreateUser={handleCreateUser}
          onUpdateUser={handleUpdateUser}
          onDeleteUser={handleDeleteUser}
          onOpenRequest={openRequestById}
          onOpenProject={openProjectById}
          onApproveRequest={handleApproveRequest}
          onRejectRequest={handleRejectRequest}
          onCorrectionRequest={handleCorrectionRequest}
          onReactivateRequest={handleReactivateRequest}
        />
      ) : null}

      {activeRole === "supervisor" ? (
        <SupervisorView
          tab={supervisorTab}
          onTabChange={setSupervisorTab}
          projects={supervisorProjects}
          requests={filteredRequests}
          users={users}
          onOpenProject={openProjectById}
          onOpenNewRequest={() => setNewRequestOpen(true)}
        />
      ) : null}

      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        nextSequence={getNextSequence(requests, projects)}
        onSubmit={handleCreateProjectFromFieldUser}
      />

      <NewRequestDialog
        open={newRequestOpen}
        onOpenChange={setNewRequestOpen}
        onSubmit={handleCreateRequest}
        existingProjects={projects}
      />

      <RequestDetailDialog
        open={selectedRequestId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequestId(null);
          }
        }}
        request={selectedRequest}
        users={users}
        projects={projects}
        linkedProjectName={projects.find((project) => project.id === selectedRequest?.linkedProjectId)?.structuredName}
        duplicateProjectName={projects.find((project) => project.id === selectedRequest?.duplicateOfProjectId)?.structuredName}
        canManageActions={isAdminArea}
        onApprove={handleApproveRequest}
        onCorrection={handleCorrectionRequest}
        onReject={handleRejectRequest}
        onOpenLinkedProject={(projectId) => {
          setSelectedRequestId(null);
          openProjectById(projectId);
        }}
      />

      <ProjectDetailDialog
        open={selectedProjectId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedProjectId(null);
          }
        }}
        project={selectedProject}
        users={users}
        currentUser={activeUser}
        canEditProject={isAdminArea || selectedProject?.createdBy === activeUser.id || (selectedProject?.participants ?? []).includes(activeUser.id)}
        canManageProjectStatus={canApproveFiles}
        canEditBudget={isAdminArea}
        canDeleteProject={activeRole === "system_admin"}
        canManageInvoices={isAdminArea}
        canAddExpense={isAdminArea || selectedProject?.createdBy === activeUser.id || (selectedProject?.participants ?? []).includes(activeUser.id)}
        onUpdateProject={handleUpdateProject}
        onAddComment={handleAddComment}
        onMessageSent={handleMessageSent}
        onUploadFile={handleUploadFile}
        onDeleteFile={handleDeleteFile}
        onDeleteProject={handleDeleteProject}
        onAddExpense={handleAddExpense}
        onDeleteExpense={handleDeleteExpense}
        onAddInvoice={handleAddInvoice}
        onUpdateInvoice={handleUpdateInvoice}
        onAddProjectImportantDate={handleAddProjectImportantDate}
        clientOptions={[...new Set([...projects.map((p) => p.client), ...requests.map((r) => r.client)].filter(Boolean))]}
        departmentOptions={[
          ...new Set([
            "Remodelaciones", "CIDEP", "CITES", "EGADE",
            ...projects.map((p) => p.department),
            ...requests.map((r) => r.department),
          ].filter(Boolean)),
        ]}
      />

      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-[70] rounded-2xl border border-white/80 bg-primary px-5 py-4 text-sm font-semibold text-white shadow-panel">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}

function getNextSequence(requests: RequestItem[], projects: ProjectItem[]): string {
  const requestNumbers = requests
    .map((request) => (request.sequence ? Number.parseInt(request.sequence, 10) : Number.NaN))
    .filter((sequence) => Number.isFinite(sequence));
  const projectNumbers = projects.map((project) => {
    const [sequence] = project.structuredName.split("-");
    return Number.parseInt(sequence, 10);
  });
  // Floor en 3969 para que el primer proyecto generado sea siempre ≥ 3970
  const maxSequence = Math.max(3969, ...requestNumbers, ...projectNumbers);

  return String(maxSequence + 1).padStart(4, "0");
}

function getProjectSequence(project: ProjectItem): string {
  const [sequence] = project.structuredName.split("-");
  return sequence.padStart(4, "0");
}

function SplashScreen({ onDone }: { onDone: () => void }): JSX.Element {
  const [phase, setPhase] = useState<"entering" | "visible" | "fading">("entering");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("visible"), 80);
    const t2 = setTimeout(() => setPhase("fading"), 1700);
    const t3 = setTimeout(onDone, 2250);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black"
      style={{
        opacity: phase === "fading" ? 0 : 1,
        transition: phase === "fading" ? "opacity 500ms ease" : undefined,
      }}
    >
      <div
        className="flex w-full select-none justify-center px-8"
        style={{
          opacity: phase === "entering" ? 0 : 1,
          transform: phase === "entering" ? "scale(0.94)" : "scale(1)",
          transition: "opacity 600ms ease, transform 600ms ease",
        }}
      >
        <img
          src={splashLogoUrl}
          alt="AMPER"
          className="h-auto w-[min(72vw,720px)] max-w-full object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}

function LoginView({
  onLogin,
  initialEmail = "",
}: {
  onLogin: (email: string, password: string) => Promise<string | null>;
  initialEmail?: string;
}): JSX.Element {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialEmail) passwordRef.current?.focus();
  }, [initialEmail]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError("");
    setLoading(true);
    const loginError = await onLogin(email, password);
    setLoading(false);

    if (loginError) {
      setError(loginError);
      return;
    }

    setEmail("");
    setPassword("");
    setError("");
  };

  return (
    <div className="dashboard-shell items-center justify-center">
      <div className="w-full max-w-5xl overflow-hidden rounded-[32px] border border-[#3F3F46] bg-[#27272A] shadow-panel">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col justify-center bg-[#1E1E20] p-8">
            <div className="w-full max-w-[320px] overflow-hidden rounded-[24px] border border-accent/30 bg-black shadow-glow-gold">
              <img
                src={wordmarkLogoUrl}
                alt="AMPER"
                className="block h-auto w-full"
                draggable={false}
              />
            </div>
            <h1 className="mt-8 text-3xl font-bold tracking-tight text-white">Bienvenido</h1>
            <p className="mt-2 text-sm leading-6 text-[#71717A]">
              Ingresa con tu correo y contraseña institucionales. Si no tienes acceso, contacta al administrador del sistema.
            </p>
            <p className="mt-4 text-xs text-[#52525B]">ENERMAN — Uso exclusivo personal interno</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Acceso al sistema</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">Correo y contraseña</h2>
            </div>

            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#888888]">Correo</span>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="correo@enerman.com.mx" autoComplete="off" />
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#888888]">Contraseña</span>
              <div className="relative">
                <Input
                  ref={passwordRef}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="Tu contraseña"
                  autoComplete="new-password"
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-[#A1A1AA] transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error ? <p className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">{error}</p> : null}

            <Button type="submit" variant="accent" className="w-full" disabled={!email.trim() || !password || loading}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Verificando...
                </span>
              ) : "Entrar"}
            </Button>

            {import.meta.env.DEV ? (
              <div className="rounded-2xl border border-[#3F3F46] bg-[#313136] p-4 text-xs leading-5 text-[#A1A1AA]">
                Cuenta Gestor del sistema inicial: amper.enerman@gmail.com
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}

function normalizeUsers(sourceUsers: UserItem[]): UserItem[] {
  const seededById = new Map(usersSeed.map((user) => [user.id, user]));
  const incomingById = new Map(sourceUsers.map((user) => [user.id, user]));
  const mergedSeeds = usersSeed.map((seed) => {
    const incoming = incomingById.get(seed.id);
    return {
      ...seed,
      ...incoming,
      firstName: incoming?.firstName ?? seed.firstName,
      lastName: incoming?.lastName ?? seed.lastName,
      name: `${incoming?.firstName ?? seed.firstName ?? ""} ${incoming?.lastName ?? seed.lastName ?? ""}`.trim() || incoming?.name || seed.name,
      email: seed.email,
      password: incoming?.password ?? seed.password,
      isActive: incoming?.isActive ?? seed.isActive ?? true,
    };
  });
  const customUsers = sourceUsers.filter((user) => !seededById.has(user.id));

  return [...mergedSeeds, ...customUsers];
}
