import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { Avatar } from "@/components/ui/avatar";
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
import { EngineerView } from "@/features/engineer/engineer-view";
import { SupervisorView } from "@/features/supervisor/supervisor-view";
import { fetchActivityLogs, fetchAppState, loginUser, logoutUser, saveAppState, SessionRequiredError, uploadFile } from "@/lib/api";
import { buildStructuredName, formatLocalDateKey } from "@/lib/utils";
import { ActivityLogItem, NotificationItem, ProjectItem, RequestItem, RoleKey, UserItem } from "@/types";

type EngineerTab = "projects" | "requests" | "notifications" | "calendar";
type EngineerProjectFilter = "all" | "en-programacion" | "en-concurso" | "in-progress" | "unpaid";
type EngineerRequestFilter = "all" | "under-review" | "approved" | "rejected";
type AdminTab = "review" | "active" | "completed" | "cancelled" | "unpaid" | "rejected" | "correction" | "calendar" | "users" | "projects" | "requests" | "activity";
type SupervisorTab = "open" | "closed" | "calendar" | "requests" | "invoices";

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
  const [engineerTab, setEngineerTab] = useState<EngineerTab>("projects");
  const [engineerProjectFilter, setEngineerProjectFilter] = useState<EngineerProjectFilter>("all");
  const [engineerRequestFilter, setEngineerRequestFilter] = useState<EngineerRequestFilter>("all");
  const [adminTab, setAdminTab] = useState<AdminTab>("review");
  const [supervisorTab, setSupervisorTab] = useState<SupervisorTab>("open");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const signedInAccounts = users.filter((user) => user.isActive !== false && signedInUserIds.includes(user.id));
  const isLoggedOut = showLogin || signedInAccounts.length === 0 || activeUserId === null;
  const activeUser = signedInAccounts.find((user) => user.id === activeUserId) ?? signedInAccounts[0] ?? users[0];

  const activeRole = activeUser.role;
  const isAdminArea = activeRole === "admin" || activeRole === "system_admin";

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredProjects = useMemo(
    () =>
      projects.filter((project) => {
        if (!normalizedQuery) {
          return true;
        }

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

  const CLOSED_STATUSES = ["completed", "cancelled", "no-autorizado", "cierre-por-sistema"];
  const engineerProjects = useMemo(() => {
    return filteredProjects.filter(
      (project) =>
        !CLOSED_STATUSES.includes(project.status) &&
        (project.createdBy === activeUser.id || project.participants.includes(activeUser.id)),
    );
  }, [activeUser.id, filteredProjects]);

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
      const dateTime = new Date(`${date}T00:00:00`).getTime();
      if (!Number.isFinite(dateTime)) return null;
      return Math.round((dateTime - todayTime) / 86400000);
    };
    const isNear = (date?: string): boolean => {
      const diff = daysUntil(date);
      return diff !== null && diff >= 0 && diff <= 3;
    };
    const dateLabel = (date: string): string => {
      const diff = daysUntil(date);
      if (diff === 0) return "hoy";
      if (diff === 1) return "mañana";
      return `en ${diff} días`;
    };

    return projects.flatMap((project) => {
      const projectDates = [
        ...(project.commitmentDate ? [{ id: "commitment", title: "Fecha compromiso", date: project.commitmentDate }] : []),
        ...(project.endDate ? [{ id: "end", title: "Fecha final", date: project.endDate }] : []),
        ...(project.importantDates ?? []).map((item) => ({ id: item.id, title: item.title, date: item.date })),
      ];

      return projectDates
        .filter((item) => isNear(item.date))
        .map((item) => {
          const involvedEngineerIds = new Set([project.createdBy, ...project.participants]);
          const userIds = users
            .filter(
              (user) =>
                user.role === "admin" ||
                user.role === "system_admin" ||
                user.role === "supervisor" ||
                (user.role === "engineer" && involvedEngineerIds.has(user.id)),
            )
            .map((user) => user.id);

          return {
            id: `important-date-${project.id}-${item.id}`,
            role: "engineer" as const,
            userIds,
            title: `${item.title} ${dateLabel(item.date)}`,
            description: `${project.structuredName}: ${item.title} ${dateLabel(item.date)}.`,
            createdAt: new Date().toISOString(),
            isRead: false,
            relatedProjectId: project.id,
          };
        });
    });
  }, [projects, users]);

  const allNotifications = [...notifications, ...dueImportantDateNotifications];
  const visibleNotifications = allNotifications.filter((notification) =>
    notification.userIds ? notification.userIds.includes(activeUser.id) : notification.role === activeRole,
  );
  const engineerNotifications = visibleNotifications.filter((notification) => notification.role === "engineer" || notification.userIds);
  const adminReviewRequests = filteredRequests.filter((request) => request.status === "under-review");
  const adminRejectedRequests = filteredRequests.filter((request) => request.status === "rejected");
  const adminCorrectionRequests = filteredRequests.filter((request) => request.status === "needs-correction");
  const ACTIVE_STATUSES = ["en-programacion", "en-concurso", "in-progress", "pendiente-aprobacion", "pendiente-autorizar", "reasignado", "comparativa"];
  const adminActiveProjects = filteredProjects.filter((project) => ACTIVE_STATUSES.includes(project.status));
  const adminCompletedProjects = filteredProjects.filter((project) => project.status === "completed" || project.status === "cierre-por-sistema");
  const adminCancelledProjects = filteredProjects.filter((project) => project.status === "cancelled" || project.status === "no-autorizado");
  const adminUnpaidProjects = filteredProjects.filter((project) => project.paymentStatus === "unpaid");

  const supervisorProjects = filteredProjects;

  const selectedRequest = requests.find((request) => request.id === selectedRequestId);
  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  const unreadCount = visibleNotifications.filter((notification) => !notification.isRead).length;

  useEffect(() => {
    let cancelled = false;

    fetchAppState()
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setUsers(normalizeUsers(payload.users.length > 1 || payload.projects.length > 0 ? payload.users : usersSeed));
        setProjects(payload.projects.length > 0 ? payload.projects : projectsSeed);
        setRequests(payload.requests.length > 0 ? payload.requests : requestsSeed);
        setNotifications(payload.notifications.length > 0 ? payload.notifications : notificationsSeed);
        setApiReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof SessionRequiredError) {
          setShowLogin(true);
        } else {
          setApiReady(false);
          setToastMessage("Modo local: configura api/config.php para guardar en MySQL");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHasHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
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

  useEffect(() => {
    if (!hasHydrated || !apiReady) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      saveAppState({ users, projects, requests, notifications }).catch(() => {
        setApiReady(false);
        setToastMessage("No se pudo guardar en la base de datos");
      });
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [apiReady, hasHydrated, notifications, projects, requests, users]);

  const openProjectById = (projectId: string): void => {
    setSelectedProjectId(projectId);
  };

  const openRequestById = (requestId: string): void => {
    setSelectedRequestId(requestId);
  };

  const handleLogin = async (email: string, password: string): Promise<boolean> => {
    try {
      const result = await loginUser(email.trim(), password);
      const userId = result.user.id;
      setSignedInUserIds((current) => (current.includes(userId) ? current : [...current, userId]));
      setActiveUserId(userId);
      setShowLogin(false);
      setSearchQuery("");
      setSelectedProjectId(null);
      setSelectedRequestId(null);
      setNewProjectOpen(false);
      setNewRequestOpen(false);
      if (!apiReady) {
        try {
          const payload = await fetchAppState();
          setUsers(normalizeUsers(payload.users.length > 1 || payload.projects.length > 0 ? payload.users : usersSeed));
          setProjects(payload.projects.length > 0 ? payload.projects : projectsSeed);
          setRequests(payload.requests.length > 0 ? payload.requests : requestsSeed);
          setNotifications(payload.notifications.length > 0 ? payload.notifications : notificationsSeed);
          setApiReady(true);
        } catch {
          // keep seed data; DB not reachable after login
        }
      }
      return true;
    } catch {
      return false;
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

  const handleMarkRead = (notificationId: string): void => {
    setNotifications((current) =>
      current.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
    );
  };

  const handleCreateRequest = (payload: Omit<RequestItem, "id" | "createdAt" | "createdBy" | "status">): void => {
    const request: RequestItem = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      createdBy: activeUser.id,
      status: payload.duplicateOfProjectId ? "under-review" : "under-review",
      ...payload,
    };

    setRequests((current) => [request, ...current]);
    setNotifications((current) => [
      {
        id: crypto.randomUUID(),
        role: "admin",
        title: "Nueva solicitud recibida",
        description: `${request.structuredName} ingresó para revisión administrativa.`,
        createdAt: new Date().toISOString(),
        isRead: false,
        relatedRequestId: request.id,
      },
      ...current,
    ]);
    setEngineerTab("requests");
  };

  const handleCreateProjectFromFieldUser = (payload: {
    baseName: string;
    client: string;
    department: string;
    type: ProjectItem["type"];
    description: string;
    totalContratado: number;
  }): void => {
    const sequence = getNextSequence(requests, projects);
    const now = new Date().toISOString();
    const structuredName = buildStructuredName({
      sequence,
      client: payload.client,
      department: payload.department,
      type: payload.type,
      baseName: payload.baseName,
    });
    const project: ProjectItem = {
      id: `project-${sequence}`,
      structuredName,
      baseName: payload.baseName,
      client: payload.client,
      department: payload.department,
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
    setNotifications((current) => [
      {
        id: crypto.randomUUID(),
        role: "admin",
        userIds: adminUserIds,
        title: "Proyecto creado desde operación",
        description: `${activeUser.name} dio de alta ${structuredName}.`,
        createdAt: now,
        isRead: false,
        relatedProjectId: project.id,
      },
      ...current,
    ]);
    setEngineerTab("projects");
    setSelectedProjectId(project.id);
    setToastMessage(`Proyecto ${sequence} creado`);
  };

  const handleApproveRequest = (requestId: string): void => {
    const requestToApprove = requests.find((request) => request.id === requestId);

    if (!requestToApprove) {
      return;
    }

    const nextSequence = getNextSequence(requests, projects);
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

    if (!requestToApprove.linkedProjectId) {
      const now = new Date().toISOString();
      const newProject: ProjectItem = {
        id: linkedProjectId,
        structuredName: approvedStructuredName,
        baseName: requestToApprove.baseName,
        client: requestToApprove.client,
        department: requestToApprove.department,
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
        history: [
          {
            id: crypto.randomUUID(),
            createdAt: now,
            action: "Proyecto creado desde solicitud aprobada",
            author: activeUser.name,
          },
        ],
      };

      setProjects((current) => [newProject, ...current]);
    }

    setRequests((current) =>
      current.map((request) =>
        request.id === requestId
          ? {
              ...request,
              sequence: request.sequence ?? nextSequence,
              structuredName: approvedStructuredName,
              status: "approved",
              linkedProjectId,
              rejectionReason: undefined,
              correctionReason: undefined,
            }
          : request,
      ),
    );
    setSelectedRequestId(null);
    setToastMessage("Solicitud aprobada");
  };

  const handleCorrectionRequest = (requestId: string, reason: string): void => {
    setRequests((current) =>
      current.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status: "needs-correction",
              correctionReason: reason,
              rejectionReason: undefined,
            }
          : request,
      ),
    );
    setSelectedRequestId(null);
    setToastMessage("Solicitud enviada a corrección");
  };

  const handleRejectRequest = (requestId: string, reason: string): void => {
    setRequests((current) =>
      current.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status: "rejected",
              rejectionReason: reason,
              correctionReason: undefined,
            }
          : request,
      ),
    );
    setSelectedRequestId(null);
    setToastMessage("Solicitud rechazada");
  };

  const handleSaveProject = (
    projectId: string,
    payload: Pick<ProjectItem, "description" | "summary">,
  ): void => {
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              ...payload,
              updatedAt: new Date().toISOString(),
              history: [
                {
                  id: crypto.randomUUID(),
                  createdAt: new Date().toISOString(),
                  action: "Se actualizaron datos generales del proyecto",
                  author: activeUser.name,
                },
                ...project.history,
              ],
            }
          : project,
      ),
    );
  };

  const handleAdminUpdateProject = (
    projectId: string,
    payload: {
      status: ProjectItem["status"];
      paymentStatus: ProjectItem["paymentStatus"];
      tipoPago?: ProjectItem["tipoPago"];
      priority: ProjectItem["priority"];
      commitmentDate?: ProjectItem["commitmentDate"];
      startDate?: ProjectItem["startDate"];
      endDate?: ProjectItem["endDate"];
      estimacion?: ProjectItem["estimacion"];
      cotizacion?: ProjectItem["cotizacion"];
      oc?: ProjectItem["oc"];
      facturarA?: ProjectItem["facturarA"];
      negociador?: ProjectItem["negociador"];
      usuarioContacto?: ProjectItem["usuarioContacto"];
      totalSinIva?: ProjectItem["totalSinIva"];
      assignedEngineerId?: string;
    },
  ): void => {
    const paymentLabelMap: Record<ProjectItem["paymentStatus"], string> = {
      unpaid: "No pagado",
      partial: "Pago parcial",
      paid: "Pagado",
    };
    const now = new Date().toISOString();
    const assignedEngineer = payload.assignedEngineerId
      ? users.find((user) => user.id === payload.assignedEngineerId && user.role === "engineer")
      : undefined;
    let assignmentNotification: NotificationItem | null = null;

    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? (() => {
              const previousEngineer = users.find(
                (user) => user.role === "engineer" && (user.id === project.createdBy || project.participants.includes(user.id)),
              );
              const assignmentChanged = Boolean(assignedEngineer && assignedEngineer.id !== previousEngineer?.id);
              const participants = assignedEngineer
                ? Array.from(new Set([...project.participants, assignedEngineer.id]))
                : project.participants;

              if (assignmentChanged) {
                assignmentNotification = {
                  id: crypto.randomUUID(),
                  role: "engineer",
                  userIds: [assignedEngineer!.id],
                  title: "Nuevo proyecto asignado",
                  description: `${activeUser.name} te asigno ${project.structuredName}.`,
                  createdAt: now,
                  isRead: false,
                  relatedProjectId: project.id,
                };
              }

              return {
              ...project,
              status: payload.status,
              paymentStatus: payload.paymentStatus,
              tipoPago: payload.tipoPago,
              priority: payload.priority,
              commitmentDate: payload.commitmentDate,
              startDate: payload.startDate,
              endDate: payload.endDate,
              paymentLabel: paymentLabelMap[payload.paymentStatus],
              estimacion: payload.estimacion,
              cotizacion: payload.cotizacion,
              oc: payload.oc,
              facturarA: payload.facturarA,
              negociador: payload.negociador,
              usuarioContacto: payload.usuarioContacto,
              totalSinIva: payload.totalSinIva,
              createdBy: assignedEngineer?.id ?? project.createdBy,
              participants,
              updatedAt: now,
              history: [
                {
                  id: crypto.randomUUID(),
                  createdAt: now,
                  action: assignmentChanged
                    ? `Administracion asigno el proyecto a ${assignedEngineer!.name}`
                    : "Administracion actualizo estado del proyecto",
                  author: activeUser.name,
                },
                ...project.history,
              ],
              };
            })()
          : project,
      ),
    );

    if (assignmentNotification) {
      setNotifications((current) => [assignmentNotification as NotificationItem, ...current]);
    }
  };

  const handleAddComment = (projectId: string, message: string, isPriority: boolean, authorId: string): void => {
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              updatedAt: new Date().toISOString(),
              comments: [
                {
                  id: crypto.randomUUID(),
                  authorId,
                  message,
                  createdAt: new Date().toISOString(),
                  isPriority,
                },
                ...project.comments,
              ],
              history: [
                {
                  id: crypto.randomUUID(),
                  createdAt: new Date().toISOString(),
                  action: isPriority ? "Se agregó comentario prioritario" : "Se agregó comentario",
                  author: activeUser.name,
                },
                ...project.history,
              ],
            }
          : project,
      ),
    );
  };

  const handleAddExpense = (
    projectId: string,
    expense: Omit<import("@/types").ProjectExpenseItem, "id" | "createdAt" | "creadoPor">,
  ): void => {
    const now = new Date().toISOString();
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              updatedAt: now,
              expenses: [
                ...project.expenses,
                {
                  ...expense,
                  id: crypto.randomUUID(),
                  creadoPor: activeUser.id,
                  createdAt: now,
                },
              ],
              history: [
                {
                  id: crypto.randomUUID(),
                  createdAt: now,
                  action: `Gasto registrado: ${expense.titulo} (${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(expense.monto)})`,
                  author: activeUser.name,
                },
                ...project.history,
              ],
            }
          : project,
      ),
    );
  };

  const handleDeleteExpense = (projectId: string, expenseId: string): void => {
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              updatedAt: new Date().toISOString(),
              expenses: project.expenses.filter((e) => e.id !== expenseId),
              history: [
                {
                  id: crypto.randomUUID(),
                  createdAt: new Date().toISOString(),
                  action: "Gasto eliminado",
                  author: activeUser.name,
                },
                ...project.history,
              ],
            }
          : project,
      ),
    );
  };

  const handleUpdateBudget = (projectId: string, amount: number): void => {
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              totalContratado: amount,
              updatedAt: new Date().toISOString(),
              history: [
                {
                  id: crypto.randomUUID(),
                  createdAt: new Date().toISOString(),
                  action: `Monto contratado actualizado a ${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(amount)}`,
                  author: activeUser.name,
                },
                ...project.history,
              ],
            }
          : project,
      ),
    );
  };

  const handleAddProjectImportantDate = (
    projectId: string,
    payload: { title: string; date: string },
  ): void => {
    const now = new Date().toISOString();

    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              updatedAt: now,
              importantDates: [
                ...(project.importantDates ?? []),
                {
                  id: crypto.randomUUID(),
                  title: payload.title,
                  date: payload.date,
                  createdBy: activeUser.id,
                  createdAt: now,
                },
              ],
              history: [
                {
                  id: crypto.randomUUID(),
                  createdAt: now,
                  action: "Se agregó fecha importante al calendario",
                  author: activeUser.name,
                },
                ...project.history,
              ],
            }
          : project,
      ),
    );
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
    const fullName = `${payload.firstName ?? ""} ${payload.lastName ?? ""}`.trim();
    const initials =
      fullName
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "US";

    setUsers((current) => [
      {
        ...payload,
        id: crypto.randomUUID(),
        name: fullName,
        avatar: initials,
        roleLabel: roleLabels[payload.role],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      ...current,
    ]);
    setToastMessage("Usuario creado");
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

    setUsers((current) =>
      current.map((user) =>
        user.id === userId
          ? {
              ...user,
              ...payload,
              name: fullName || user.name,
              avatar: initials,
              roleLabel: roleLabels[payload.role],
              updatedAt: new Date().toISOString(),
            }
          : user,
      ),
    );
    setToastMessage("Usuario actualizado");
  };

  const handleDeleteUser = (userId: string): void => {
    if (userId === activeUser.id) {
      setToastMessage("No puedes eliminar tu propia cuenta activa");
      return;
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
      type: payload.type,
      baseName: payload.baseName,
    });

    const project: ProjectItem = {
      id: `project-${sequence}`,
      structuredName,
      baseName: payload.baseName,
      client: payload.client,
      department: payload.department,
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
    setNotifications((current) => [
      ...(assignedEngineer
        ? [{
            id: crypto.randomUUID(),
            role: "engineer" as const,
            userIds: [assignedEngineer.id],
            title: "Nuevo proyecto asignado",
            description: `${activeUser.name} te asigno ${structuredName}.`,
            createdAt: now,
            isRead: false,
            relatedProjectId: project.id,
          }]
        : []),
      {
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
      },
      ...current,
    ]);
    setToastMessage(`Proyecto ${sequence} creado`);
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

  const handleDeleteRequest = (requestId: string): void => {
    setRequests((current) => current.filter((request) => request.id !== requestId));
    setSelectedRequestId(null);
    setToastMessage("Solicitud eliminada");
  };

  const handleAddInvoice = (
    projectId: string,
    invoice: Omit<import("@/types").InvoiceItem, "id" | "createdAt" | "createdBy">,
  ): void => {
    const now = new Date().toISOString();
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              updatedAt: now,
              invoices: [
                ...(project.invoices ?? []),
                {
                  ...invoice,
                  id: crypto.randomUUID(),
                  createdAt: now,
                  createdBy: activeUser.id,
                },
              ],
              history: [
                {
                  id: crypto.randomUUID(),
                  createdAt: now,
                  action: `Factura solicitada a Mere — OC: ${invoice.oc}`,
                  author: activeUser.name,
                },
                ...project.history,
              ],
            }
          : project,
      ),
    );
  };

  const handleUpdateInvoice = (
    projectId: string,
    invoiceId: string,
    updates: Partial<import("@/types").InvoiceItem>,
  ): void => {
    const now = new Date().toISOString();
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
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo"));
      reader.readAsDataURL(file);
    });

  const handleUploadFile = async (projectId: string, file: File): Promise<void> => {
    const now = new Date().toISOString();
    const addFileToProject = (fileItem: import("@/types").ProjectFileItem, action: string): void => {
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? {
                ...project,
                updatedAt: now,
                files: [...project.files, fileItem],
                history: [
                  {
                    id: crypto.randomUUID(),
                    createdAt: now,
                    action,
                    author: activeUser.name,
                  },
                  ...project.history,
                ],
              }
            : project,
        ),
      );
    };

    try {
      const fileItem = await uploadFile(projectId, file);
      addFileToProject(fileItem, `Archivo subido: ${file.name}`);
    } catch (err) {
      const dataUrl = await fileToDataUrl(file);
      const bytes = file.size;
      const sizeLabel = bytes < 1048576 ? `${Math.round((bytes / 1024) * 10) / 10} KB` : `${Math.round((bytes / 1048576) * 10) / 10} MB`;
      addFileToProject(
        {
          id: crypto.randomUUID(),
          name: file.name,
          sizeLabel,
          uploadedAt: now,
          url: dataUrl,
        },
        `Archivo guardado en proyecto: ${file.name}`,
      );
      setToastMessage("Imagen guardada en el proyecto");
    }
  };

  const handleDeleteProject = (projectId: string): void => {
    setProjects((current) => current.filter((project) => project.id !== projectId));
    setRequests((current) =>
      current.map((request) =>
        request.linkedProjectId === projectId
          ? {
              ...request,
              linkedProjectId: undefined,
            }
          : request,
      ),
    );
    setSelectedProjectId(null);
    setToastMessage("Proyecto eliminado");
  };

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  if (isLoggedOut) {
    return (
      <LoginView
        users={users}
        signedInAccounts={signedInAccounts}
        onLogin={handleLogin}
        onUseOpenSession={(userId) => {
          setActiveUserId(userId);
          setShowLogin(false);
        }}
      />
    );
  }

  return (
    <div className="dashboard-shell gap-6">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        unreadCount={unreadCount}
        activeUser={activeUser}
        accounts={signedInAccounts}
        onAccountChange={(userId) => {
          setActiveUserId(userId);
          setSearchQuery("");
          setSelectedProjectId(null);
          setSelectedRequestId(null);
          setNewProjectOpen(false);
          setNewRequestOpen(false);
        }}
        onAddAccount={() => setShowLogin(true)}
        onLogout={handleLogout}
        onNotificationsClick={() => {
          if (activeRole === "engineer") {
            setEngineerTab("notifications");
          }

          if (isAdminArea) {
            setAdminTab("review");
          }

          if (activeRole === "supervisor") {
            setSupervisorTab("open");
          }
        }}
      />

      {activeRole === "engineer" ? (
        <EngineerView
          tab={engineerTab}
          onTabChange={setEngineerTab}
          activeUserName={activeUser.name}
          projectFilter={engineerProjectFilter}
          onProjectFilterChange={setEngineerProjectFilter}
          requestFilter={engineerRequestFilter}
          onRequestFilterChange={setEngineerRequestFilter}
          projects={engineerProjects}
          calendarProjects={engineerCalendarProjects}
          requests={engineerRequests}
          notifications={engineerNotifications}
          onOpenProject={openProjectById}
          onOpenRequest={openRequestById}
          onOpenNewProject={() => setNewProjectOpen(true)}
          onOpenNewRequest={() => setNewRequestOpen(true)}
          onMarkRead={handleMarkRead}
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
          unpaidProjects={adminUnpaidProjects}
          rejectedRequests={adminRejectedRequests}
          correctionRequests={adminCorrectionRequests}
          projects={filteredProjects}
          requests={filteredRequests}
          users={users}
          activityLogs={activityLogs}
          canManageUsers={activeRole === "system_admin"}
          onCreateProject={handleCreateProjectFromAdmin}
          onDeleteProject={handleDeleteProject}
          onCreateRequest={handleCreateRequestFromAdmin}
          onDeleteRequest={handleDeleteRequest}
          onCreateUser={handleCreateUser}
          onUpdateUser={handleUpdateUser}
          onDeleteUser={handleDeleteUser}
          onOpenRequest={openRequestById}
          onOpenProject={openProjectById}
        />
      ) : null}

      {activeRole === "supervisor" ? (
        <SupervisorView
          tab={supervisorTab}
          onTabChange={setSupervisorTab}
          projects={supervisorProjects}
          requests={filteredRequests}
          onOpenProject={openProjectById}
          onOpenNewProject={() => setNewProjectOpen(true)}
        />
      ) : null}

      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        nextSequence={getNextSequence(requests, projects)}
        onSubmit={handleCreateProjectFromFieldUser}
        clientOptions={[...new Set([...projects.map((project) => project.client), ...requests.map((request) => request.client)])]}
        departmentOptions={[
          ...new Set([
            "Remodelaciones",
            "CIDEP",
            "CITES",
            "EGADE",
            ...projects.map((project) => project.department),
            ...requests.map((request) => request.department),
          ]),
        ]}
      />

      <NewRequestDialog
        open={newRequestOpen}
        onOpenChange={setNewRequestOpen}
        onSubmit={handleCreateRequest}
        existingProjects={projects}
        clientOptions={[...new Set([...projects.map((project) => project.client), ...requests.map((request) => request.client)])]}
        departmentOptions={[
          ...new Set([
            "Remodelaciones",
            "CIDEP",
            "CITES",
            "EGADE",
            ...projects.map((project) => project.department),
            ...requests.map((request) => request.department),
          ]),
        ]}
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
        canEditProject
        canManageProjectStatus={isAdminArea}
        canManageProjectCalendar
        canAddExpense
        canDeleteExpense={isAdminArea}
        canEditBudget
        canDeleteProject={activeRole === "system_admin"}
        canManageInvoices={isAdminArea}
        onSaveProject={handleSaveProject}
        onAdminUpdateProject={handleAdminUpdateProject}
        onAddComment={handleAddComment}
        onAddProjectImportantDate={handleAddProjectImportantDate}
        onAddExpense={handleAddExpense}
        onDeleteExpense={handleDeleteExpense}
        onUpdateBudget={handleUpdateBudget}
        onAddInvoice={handleAddInvoice}
        onUpdateInvoice={handleUpdateInvoice}
        onUploadFile={handleUploadFile}
        onDeleteProject={handleDeleteProject}
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
  const maxSequence = Math.max(0, ...requestNumbers, ...projectNumbers);

  return String(maxSequence + 1).padStart(4, "0");
}

function getProjectSequence(project: ProjectItem): string {
  const [sequence] = project.structuredName.split("-");
  return sequence.padStart(4, "0");
}

function SplashScreen({ onDone }: { onDone: () => void }): JSX.Element {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 1600);
    const doneTimer = setTimeout(onDone, 2100);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black transition-opacity duration-500"
      style={{ opacity: fading ? 0 : 1 }}
    >
      <div className="flex w-full justify-center px-8 select-none">
        <img
          src="/amper-logo.jpeg"
          alt="AMPER"
          className="w-[min(78vw,920px)] max-w-full object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}

function LoginView({
  signedInAccounts,
  onLogin,
  onUseOpenSession,
}: {
  users: UserItem[];
  signedInAccounts: UserItem[];
  onLogin: (email: string, password: string) => Promise<boolean>;
  onUseOpenSession: (userId: string) => void;
}): JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    const ok = await onLogin(email, password);
    setLoading(false);

    if (!ok) {
      setError("Revisa el correo y la contrasena.");
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
          <div className="bg-[#1E1E20] p-8">
            <img
              src="/amper-logo.jpeg"
              alt="AMPER"
              className="h-20 w-44 rounded-2xl border border-accent/30 bg-black object-contain p-2 shadow-glow-gold"
              draggable={false}
            />
            <h1 className="mt-8 text-3xl font-bold tracking-tight text-white">Iniciar sesion</h1>
            <p className="mt-3 text-sm leading-6 text-[#A1A1AA]">
              Accede con correo y contrasena. Puedes mantener varias cuentas abiertas en este navegador y cambiar entre ellas desde el menu superior.
            </p>

            {signedInAccounts.length > 0 ? (
              <div className="mt-8 space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#888888]">Sesiones abiertas</p>
                {signedInAccounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => onUseOpenSession(account.id)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-[#3F3F46] bg-[#313136] px-3 py-3 text-left transition hover:border-accent/25"
                  >
                    <Avatar initials={account.avatar} className="h-10 w-10 text-xs" />
                    <span>
                      <span className="block text-sm font-semibold text-foreground">{account.name}</span>
                      <span className="block text-xs text-[#888888]">{account.roleLabel}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Credenciales</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">Correo y contrasena</h2>
            </div>

            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#888888]">Correo</span>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="correo@enerman.com.mx" autoComplete="email" />
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#888888]">Contrasena</span>
              <Input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="Tu contrasena"
                autoComplete="current-password"
              />
            </label>

            {error ? <p className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">{error}</p> : null}

            <Button type="submit" variant="accent" className="w-full" disabled={!email.trim() || !password || loading}>
              {loading ? "Verificando..." : "Entrar"}
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
