import { ArrowUpRight, Bell, FolderPlus, Plus } from "lucide-react";
import { SectionTitle } from "@/components/layout/section-title";
import { Tabs } from "@/components/ui/tabs";
import { ProjectCard } from "@/components/cards/project-card";
import { RequestCard } from "@/components/cards/request-card";
import { Card } from "@/components/ui/card";
import { ProjectCalendar } from "@/components/common/project-calendar";
import { NotificationItem, ProjectItem, RequestItem } from "@/types";

type EngineerTab = "projects" | "requests" | "notifications" | "calendar";
type EngineerProjectFilter = "all" | "en-programacion" | "en-concurso" | "in-progress" | "unpaid";
type EngineerRequestFilter = "all" | "under-review" | "approved" | "rejected";

interface EngineerViewProps {
  tab: EngineerTab;
  onTabChange: (tab: EngineerTab) => void;
  activeUserName: string;
  projectFilter: EngineerProjectFilter;
  onProjectFilterChange: (filter: EngineerProjectFilter) => void;
  requestFilter: EngineerRequestFilter;
  onRequestFilterChange: (filter: EngineerRequestFilter) => void;
  projects: ProjectItem[];
  calendarProjects: ProjectItem[];
  requests: RequestItem[];
  notifications: NotificationItem[];
  onOpenProject: (projectId: string) => void;
  onOpenRequest: (requestId: string) => void;
  onOpenNewProject: () => void;
  onOpenNewRequest: () => void;
  onMarkRead: (notificationId: string) => void;
}

export function EngineerView({
  tab,
  onTabChange,
  activeUserName,
  projectFilter,
  onProjectFilterChange,
  requestFilter,
  onRequestFilterChange,
  projects,
  calendarProjects,
  requests,
  notifications,
  onOpenProject,
  onOpenRequest,
  onOpenNewProject,
  onOpenNewRequest,
  onMarkRead,
}: EngineerViewProps): JSX.Element {
  const projectFilterOptions = [
    { key: "all" as const, label: "Todos", count: projects.length },
    {
      key: "en-programacion" as const,
      label: "En programación",
      count: projects.filter((project) => project.status === "en-programacion").length,
    },
    {
      key: "en-concurso" as const,
      label: "En concurso",
      count: projects.filter((project) => project.status === "en-concurso").length,
    },
    {
      key: "in-progress" as const,
      label: "En proceso",
      count: projects.filter((project) => project.status === "in-progress").length,
    },
    {
      key: "unpaid" as const,
      label: "No pagados",
      count: projects.filter((project) => project.paymentStatus === "unpaid").length,
    },
  ];

  const filteredProjects =
    projectFilter === "all"
      ? projects
      : projects.filter((project) => {
          if (projectFilter === "en-programacion") return project.status === "en-programacion";
          if (projectFilter === "en-concurso") return project.status === "en-concurso";
          if (projectFilter === "in-progress") return project.status === "in-progress";
          return project.paymentStatus === "unpaid";
        });

  const filteredRequests =
    requestFilter === "all" ? requests : requests.filter((request) => request.status === requestFilter);

  const requestFilterOptions = [
    { key: "all" as const, label: "Todas", count: requests.length },
    {
      key: "under-review" as const,
      label: "En revisión",
      count: requests.filter((request) => request.status === "under-review").length,
    },
    {
      key: "approved" as const,
      label: "Aprobadas",
      count: requests.filter((request) => request.status === "approved").length,
    },
    {
      key: "rejected" as const,
      label: "Rechazadas",
      count: requests.filter((request) => request.status === "rejected").length,
    },
  ];

  return (
    <section className="space-y-6">
      <SectionTitle
        eyebrow={`Espacio de trabajo de ${activeUserName}`}
        title="Centro de operación del ingeniero"
      />

      <Tabs
        value={tab}
        onValueChange={onTabChange}
        options={[
          { key: "projects", label: "Mis proyectos", count: projects.length },
          { key: "requests", label: "Solicitudes", count: requests.length },
          { key: "notifications", label: "Notificaciones", count: notifications.length },
          {
            key: "calendar",
            label: "Calendario",
            count: calendarProjects.reduce(
              (total, project) => total + (project.commitmentDate ? 1 : 0) + (project.importantDates?.length ?? 0),
              0,
            ),
          },
        ]}
      />

      {tab === "projects" ? (
        <div className="space-y-5">
          <Tabs value={projectFilter} onValueChange={onProjectFilterChange} options={projectFilterOptions} />
          <div className="space-y-3">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} onOpen={onOpenProject} />
            ))}
          </div>
        </div>
      ) : null}

      {tab === "requests" ? (
        <div className="space-y-5">
          <Tabs value={requestFilter} onValueChange={onRequestFilterChange} options={requestFilterOptions} />
          <div className="card-grid">
            {filteredRequests.map((request) => (
              <RequestCard key={request.id} request={request} onOpen={onOpenRequest} />
            ))}
          </div>
        </div>
      ) : null}

      {tab === "notifications" ? (
        <div className="card-grid">
          {notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => {
                onMarkRead(notification.id);
                if (notification.relatedProjectId) {
                  onOpenProject(notification.relatedProjectId);
                  return;
                }
                if (notification.relatedRequestId) {
                  onOpenRequest(notification.relatedRequestId);
                }
              }}
              className="h-full w-full text-left"
            >
              <Card className="flex h-full flex-col gap-3 transition hover:-translate-y-0.5 hover:border-accent/20 hover:shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-[#3F3F46] p-3 text-accent">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{notification.title}</h3>
                    <p className="text-sm text-[#888888]">{notification.description}</p>
                    <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent">
                      Abrir detalle
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    notification.isRead ? "bg-[#3F3F46] text-[#888888]" : "bg-secondary/15 text-secondary"
                  }`}
                >
                  {notification.isRead ? "Leída" : "Nueva"}
                </span>
              </div>
              </Card>
            </button>
          ))}
        </div>
      ) : null}

      {tab === "calendar" ? (
        <ProjectCalendar projects={calendarProjects} onOpenProject={onOpenProject} showSideList />
      ) : null}

      <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={onOpenNewProject}
          className="flex items-center gap-3 rounded-full bg-accent px-5 py-4 text-sm font-bold text-[#111111] shadow-glow-gold transition hover:bg-accent/90"
        >
          <FolderPlus className="h-5 w-5" />
          Nuevo proyecto
        </button>
        <button
          type="button"
          onClick={onOpenNewRequest}
          className="flex items-center gap-3 rounded-full border border-[#3F3F46] bg-[#27272A] px-4 py-3 text-sm font-bold text-foreground shadow-panel transition hover:border-accent/35 hover:text-accent"
        >
          <Plus className="h-4 w-4" />
          Nueva solicitud
        </button>
      </div>
    </section>
  );
}
