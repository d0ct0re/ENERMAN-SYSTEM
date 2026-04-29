import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { formatLocalDateKey, parseLocalDate } from "@/lib/utils";
import { ProjectItem } from "@/types";

interface ProjectCalendarProps {
  projects: ProjectItem[];
  onOpenProject: (projectId: string) => void;
  showSideList?: boolean;
}

type CalendarEvent = {
  id: string;
  type: "commitment" | "important";
  date: string;
  title: string;
  project: ProjectItem;
};

function getProjectSequence(project: ProjectItem): string {
  return project.structuredName.split("-")[0] ?? "XXXX";
}

export function ProjectCalendar({
  projects,
  onOpenProject,
  showSideList = true,
}: ProjectCalendarProps): JSX.Element {
  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);
  const [visibleMonth, setVisibleMonth] = useState(currentMonth);
  const [calendarHeight, setCalendarHeight] = useState<number | null>(null);
  const calendarPanelRef = useRef<HTMLDivElement | null>(null);

  const commitmentProjects = projects
    .filter((project) => project.commitmentDate)
    .sort((a, b) => parseLocalDate(a.commitmentDate!).getTime() - parseLocalDate(b.commitmentDate!).getTime());

  const calendarEvents: CalendarEvent[] = projects
    .flatMap((project) => {
      const commitmentEvent: CalendarEvent[] = project.commitmentDate
        ? [
            {
              id: `${project.id}-commitment`,
              type: "commitment",
              date: project.commitmentDate,
              title: project.baseName,
              project,
            },
          ]
        : [];

      const importantEvents: CalendarEvent[] = (project.importantDates ?? []).map((item) => ({
        id: item.id,
        type: "important",
        date: item.date,
        title: item.title,
        project,
      }));

      return [...commitmentEvent, ...importantEvents];
    })
    .sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const stats = {
    week: calendarEvents.filter((event) => {
      const date = parseLocalDate(event.date);
      return date >= startOfWeek && date <= endOfWeek;
    }).length,
    month: calendarEvents.filter((event) => {
      const date = parseLocalDate(event.date);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length,
    year: calendarEvents.filter((event) => parseLocalDate(event.date).getFullYear() === now.getFullYear()).length,
  };

  const calendarMonth = visibleMonth;
  const canGoPrevious =
    calendarMonth.getFullYear() > currentMonth.getFullYear() ||
    (calendarMonth.getFullYear() === currentMonth.getFullYear() && calendarMonth.getMonth() > currentMonth.getMonth());
  const calendarStart = new Date(calendarMonth);
  calendarStart.setDate(calendarMonth.getDate() - ((calendarMonth.getDay() + 6) % 7));
  const endOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
  const calendarEnd = new Date(endOfMonth);
  calendarEnd.setDate(endOfMonth.getDate() + (6 - ((endOfMonth.getDay() + 6) % 7)));
  const totalCalendarDays = Math.round((calendarEnd.getTime() - calendarStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const calendarDays = Array.from({ length: totalCalendarDays }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    return day;
  });

  useEffect(() => {
    const calendarPanel = calendarPanelRef.current;

    if (!calendarPanel) {
      return undefined;
    }

    const updateHeight = (): void => {
      setCalendarHeight(calendarPanel.getBoundingClientRect().height);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(calendarPanel);
    window.addEventListener("resize", updateHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [calendarDays.length, showSideList]);

  const eventsByDate = calendarEvents.reduce<Record<string, CalendarEvent[]>>((accumulator, event) => {
    accumulator[event.date] = [...(accumulator[event.date] ?? []), event];
    return accumulator;
  }, {});

  const goToPreviousMonth = (): void => {
    if (!canGoPrevious) {
      return;
    }

    setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1));
  };

  const goToNextMonth = (): void => {
    setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1));
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Esta semana", value: stats.week },
          { label: "Este mes", value: stats.month },
          { label: "Este año", value: stats.year },
        ].map((stat) => (
          <Card key={stat.label} className="bg-gradient-to-br from-accent/10 to-secondary/10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-accent">{stat.label}</p>
                <p className="mt-3 text-3xl font-semibold text-foreground">{stat.value}</p>
              </div>
              <div className="rounded-2xl bg-[#3F3F46] p-3 text-accent">
                <CalendarDays className="h-6 w-6" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className={showSideList ? "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" : "grid gap-4"}>
        <div ref={calendarPanelRef} className="rounded-[28px] border border-[#3F3F46] bg-[#27272A] p-5 shadow-panel">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-accent/15 p-3 text-accent">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(calendarMonth)}
                </h3>
                <p className="text-sm text-[#888888]">Fechas importantes programadas.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={goToPreviousMonth}
                disabled={!canGoPrevious}
                className="rounded-full border border-[#3F3F46] bg-[#313136] p-2 text-foreground transition hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goToNextMonth}
                className="rounded-full border border-[#3F3F46] bg-[#313136] p-2 text-foreground transition hover:bg-accent/10 hover:text-accent"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="rounded-full bg-secondary/15 px-3 py-1 text-xs font-semibold text-secondary">
                Compromiso
              </span>
              <span className="rounded-full bg-[#F5A524]/15 px-3 py-1 text-xs font-semibold text-[#F5A524]">
                Importante
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((dayName) => (
              <div key={dayName} className="px-2 pb-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-[#888888]">
                {dayName}
              </div>
            ))}

            {calendarDays.map((day) => {
              const dateKey = formatLocalDateKey(day);
              const dayEvents = eventsByDate[dateKey] ?? [];
              const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
              const isToday = day.toDateString() === now.toDateString();

              return (
                <div
                  key={dateKey}
                  className={`min-h-[86px] rounded-[16px] border p-2 transition sm:min-h-[104px] ${
                    isCurrentMonth ? "border-[#3F3F46] bg-[#313136]/50" : "border-[#3F3F46] bg-[#27272A]/30 opacity-50"
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        isToday ? "bg-accent text-[#111111]" : "text-foreground"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {dayEvents.length > 0 ? (
                      <span className="rounded-full bg-secondary/20 px-2 py-0.5 text-xs font-semibold text-secondary">
                        {dayEvents.length}
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    {dayEvents.slice(0, 2).map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => onOpenProject(event.project.id)}
                        className={`block w-full truncate rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold shadow-soft transition ${
                          event.type === "commitment"
                            ? "bg-secondary/20 text-secondary hover:bg-secondary hover:text-white"
                            : "bg-[#F5A524]/15 text-[#F5A524] hover:bg-[#F5A524] hover:text-[#111111]"
                        }`}
                      >
                        {`${getProjectSequence(event.project)}-${event.type === "commitment" ? "COMPROMISO" : event.title}`.toUpperCase()}
                      </button>
                    ))}
                    {dayEvents.length > 2 ? (
                      <span className="block rounded-lg bg-[#3F3F46] px-2 py-1.5 text-[11px] font-semibold text-[#888888]">
                        +{dayEvents.length - 2} más
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {showSideList ? (
          <div
            className="hidden rounded-[28px] border border-[#3F3F46] bg-[#27272A] p-5 shadow-panel lg:flex lg:flex-col"
            style={calendarHeight ? { height: `${calendarHeight}px` } : undefined}
          >
            <div className="mb-4 shrink-0">
              <h3 className="text-lg font-semibold text-foreground">Próximos compromisos</h3>
              <p className="text-sm text-[#888888]">Solo fechas compromiso asignadas.</p>
            </div>
            <div className="hide-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {commitmentProjects.length > 0 ? (
                commitmentProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onOpenProject(project.id)}
                    className="w-full rounded-[18px] border border-[#3F3F46] bg-[#313136]/50 p-4 text-left transition hover:border-accent/20 hover:bg-accent/5"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">
                      {new Intl.DateTimeFormat("es-MX", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }).format(parseLocalDate(project.commitmentDate!))}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{project.baseName}</p>
                    <p className="mt-1 text-xs text-[#888888]">{project.client} · {project.department}</p>
                  </button>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-[#3F3F46] bg-[#27272A] p-6 text-center text-sm text-[#888888]">
                  No hay fechas compromiso asignadas.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
