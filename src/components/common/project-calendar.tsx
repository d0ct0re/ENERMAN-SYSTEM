import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/status-badge";
import { formatLocalDateKey, parseLocalDate } from "@/lib/utils";
import { ENGINEER_GROUPS, getEngineerGroup } from "@/lib/engineer-groups";
import { ProjectItem, UserItem } from "@/types";

// ── Tipos de fecha (modo ingeniero / sin grupos) ───────────────
type EventType = "fin" | "compromiso" | "inicio" | "solicitud" | "importante";

const DATE_CFG: Record<EventType, { label: string; dot: string; pill: string; card: string; text: string }> = {
  fin:        { label: "F. Fin",           dot: "bg-danger",    pill: "bg-danger/15 text-danger",           card: "border-danger/20 bg-danger/[0.04]",           text: "text-danger" },
  compromiso: { label: "F. Compromiso",     dot: "bg-secondary", pill: "bg-secondary/15 text-secondary",     card: "border-secondary/20 bg-secondary/[0.04]",     text: "text-secondary" },
  inicio:     { label: "F. Inicio",         dot: "bg-[#4ADE80]", pill: "bg-[#4ADE80]/15 text-[#4ADE80]",    card: "border-[#4ADE80]/20 bg-[#4ADE80]/[0.04]",    text: "text-[#4ADE80]" },
  solicitud:  { label: "F. Solicitud",      dot: "bg-[#52525B]", pill: "bg-[#3F3F46] text-[#A1A1AA]",       card: "border-[#3F3F46] bg-[#27272A]",               text: "text-[#A1A1AA]" },
  importante: { label: "Fecha importante",  dot: "bg-[#EC4899]", pill: "bg-[#EC4899]/15 text-[#EC4899]",    card: "border-[#EC4899]/20 bg-[#EC4899]/[0.04]",    text: "text-[#EC4899]" },
};

interface CalendarEvent {
  id: string;
  type: EventType;
  date: string;
  title?: string;   // título para fechas importantes
  project: ProjectItem;
}

interface ProjectCalendarProps {
  projects: ProjectItem[];
  onOpenProject: (projectId: string) => void;
  onDeleteImportantDate?: (projectId: string, dateId: string) => void;
  users?: UserItem[];
  showSideList?: boolean;
}

// ── Helper: extrae los 5 tipos de evento de fecha de un proyecto ──
function extractEvents(projects: ProjectItem[]): CalendarEvent[] {
  return projects
    .flatMap((p) => {
      const evs: CalendarEvent[] = [];
      if (p.endDate)        evs.push({ id: `${p.id}-fin`,        type: "fin",        date: p.endDate,        project: p });
      if (p.commitmentDate) evs.push({ id: `${p.id}-compromiso`, type: "compromiso", date: p.commitmentDate, project: p });
      if (p.startDate)      evs.push({ id: `${p.id}-inicio`,     type: "inicio",     date: p.startDate,      project: p });
      if (p.fechaSolicitud) {
        const d = (p.fechaSolicitud ?? "").slice(0, 10);
        if (d) evs.push({ id: `${p.id}-solicitud`, type: "solicitud", date: d, project: p });
      }
      // Fechas importantes (campo #13) — cada una tiene título y creador propio
      for (const item of (p.importantDates ?? [])) {
        if (item.date) {
          evs.push({
            id:    item.id,
            type:  "importante",
            date:  item.date,
            title: item.title,
            project: p,
          });
        }
      }
      return evs;
    })
    .sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
}

export function ProjectCalendar({
  projects,
  onOpenProject,
  onDeleteImportantDate,
  users,
}: ProjectCalendarProps): JSX.Element {
  const isAdminMode = Boolean(users && users.length > 0);

  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);

  const [visibleMonth, setVisibleMonth]       = useState(currentMonth);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery]         = useState("");
  const [lastSyncAt, setLastSyncAt]           = useState(Date.now());
  const [tick, setTick]                       = useState(0);
  const projectsRef                           = useRef(projects);

  // Detecta cuando llegan proyectos nuevos del polling y actualiza el timestamp
  useEffect(() => {
    if (projects !== projectsRef.current) {
      projectsRef.current = projects;
      setLastSyncAt(Date.now());
    }
  }, [projects]);

  // Refresca el label "hace Xs" cada 10 segundos
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const syncLabel = (): string => {
    void tick; // hace que el label se recalcule cuando cambia el contador
    const diff = Math.floor((Date.now() - lastSyncAt) / 1000);
    if (diff < 10) return "ahora";
    if (diff < 60) return `hace ${diff}s`;
    return `hace ${Math.floor(diff / 60)}min`;
  };

  // ── Eventos ────────────────────────────────────────────────
  const allEvents = extractEvents(projects);

  // Filtro por búsqueda (ingeniero o folio) — tiene prioridad sobre el filtro de grupo
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const visibleEvents = allEvents.filter((ev) => {
    // Filtro de búsqueda
    if (normalizedSearch) {
      const engineerName = users?.find((u) => u.id === ev.project.createdBy)?.name ?? "";
      const seq          = (ev.project.structuredName ?? "").split("-")[0];
      const matchesSearch =
        engineerName.toLowerCase().includes(normalizedSearch) ||
        seq.toLowerCase().includes(normalizedSearch) ||
        ev.project.baseName.toLowerCase().includes(normalizedSearch);
      if (!matchesSearch) return false;
    }
    // Filtro de grupo (solo cuando no hay búsqueda activa)
    if (isAdminMode && selectedGroupId && !normalizedSearch) {
      const creatorGroup = getEngineerGroup(ev.project.createdBy);
      return creatorGroup?.id === selectedGroupId;
    }
    return true;
  });

  const eventsByDate = visibleEvents.reduce<Record<string, CalendarEvent[]>>((acc, ev) => {
    acc[ev.date] = [...(acc[ev.date] ?? []), ev];
    return acc;
  }, {});

  // ── Estadísticas ───────────────────────────────────────────
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  const stats = {
    week:  visibleEvents.filter((e) => { const d = parseLocalDate(e.date); return d >= startOfWeek && d <= endOfWeek; }).length,
    month: visibleEvents.filter((e) => { const d = parseLocalDate(e.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length,
    year:  visibleEvents.filter((e) => parseLocalDate(e.date).getFullYear() === now.getFullYear()).length,
  };

  // ── Grid del mes ───────────────────────────────────────────
  const calendarMonth = visibleMonth;
  const canGoPrevious =
    calendarMonth.getFullYear() > currentMonth.getFullYear() ||
    (calendarMonth.getFullYear() === currentMonth.getFullYear() && calendarMonth.getMonth() > currentMonth.getMonth());

  const calendarStart = new Date(calendarMonth);
  calendarStart.setDate(calendarMonth.getDate() - ((calendarMonth.getDay() + 6) % 7));
  const endOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
  const calendarEnd = new Date(endOfMonth);
  calendarEnd.setDate(endOfMonth.getDate() + (6 - ((endOfMonth.getDay() + 6) % 7)));
  const totalDays = Math.round((calendarEnd.getTime() - calendarStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const calendarDays = Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(calendarStart);
    d.setDate(calendarStart.getDate() + i);
    return d;
  });

  // ── Día seleccionado ───────────────────────────────────────
  const selectedEvents = selectedDateKey ? (eventsByDate[selectedDateKey] ?? []) : [];
  const selectedDate   = selectedDateKey ? parseLocalDate(selectedDateKey) : null;

  // ── Helpers para celdas en modo admin ──────────────────────
  // useMemo: ENGINEER_GROUPS es estático, no se recalcula nunca
  const assignedIds = useMemo(() => new Set(ENGINEER_GROUPS.flatMap((g) => g.memberIds)), []);

  const groupCountsForDay = (dayEvents: CalendarEvent[]) => {
    const rows = ENGINEER_GROUPS.map((g) => ({
      group: g,
      count: dayEvents.filter((ev) => g.memberIds.includes(ev.project.createdBy)).length,
    })).filter((x) => x.count > 0);
    // Ingenieros sin área: dot gris como indicador
    const ungroupedCount = dayEvents.filter((ev) => !assignedIds.has(ev.project.createdBy)).length;
    if (ungroupedCount > 0) {
      rows.push({
        group: { id: "sin-area", label: "Sin área", color: "#52525B", dot: "bg-[#52525B]", pill: "bg-[#3F3F46] text-[#888888]", card: "border-[#3F3F46] bg-[#27272A]", memberIds: [] },
        count: ungroupedCount,
      });
    }
    return rows;
  };

  return (
    <div className="space-y-5">

      {/* ── Stats ── */}
      <div className="grid gap-4 md:grid-cols-3">
        {([
          { label: "Esta semana", value: stats.week },
          { label: "Este mes",    value: stats.month },
          { label: "Este año",    value: stats.year },
        ] as const).map((stat) => (
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

      {/* ── Buscador rápido (solo admin) ── */}
      {isAdminMode ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#52525B]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSelectedDateKey(null); }}
            placeholder="Buscar ingeniero, folio o proyecto..."
            className="h-11 w-full rounded-2xl border border-[#3F3F46] bg-[#27272A] pl-10 pr-10 text-sm font-semibold text-foreground outline-none transition placeholder:text-[#52525B] focus:border-accent/40 focus:ring-2 focus:ring-accent/10"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#52525B] transition hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ── Filtro por grupo (solo admin, oculto cuando hay búsqueda activa) ── */}
      {isAdminMode && !normalizedSearch ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#888888]">Filtrar:</span>
          <button
            type="button"
            onClick={() => { setSelectedGroupId(null); setSelectedDateKey(null); }}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              selectedGroupId === null
                ? "bg-accent text-[#111111]"
                : "bg-[#27272A] border border-[#3F3F46] text-[#888888] hover:text-white"
            }`}
          >
            Todos los grupos
          </button>
          {ENGINEER_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => { setSelectedGroupId(selectedGroupId === g.id ? null : g.id); setSelectedDateKey(null); }}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                selectedGroupId === g.id ? g.pill + " ring-1 ring-current" : "bg-[#27272A] border border-[#3F3F46] text-[#888888] hover:text-white"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
              {g.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* ── Calendario ── */}
      <div className="rounded-[28px] border border-[#3F3F46] bg-[#27272A] p-5 shadow-panel">

        {/* Header */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-accent/15 p-3 text-accent">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold capitalize text-foreground">
                  {new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(calendarMonth)}
                </h3>
                {/* Indicador en vivo */}
                <span className="flex items-center gap-1.5 rounded-full border border-[#4ADE80]/20 bg-[#4ADE80]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#4ADE80]">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ADE80] opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4ADE80]" />
                  </span>
                  En vivo · {syncLabel()}
                </span>
              </div>
              <p className="text-sm text-[#888888]">
                {isAdminMode ? "Haz clic en un día para ver pendientes por grupo" : "Fechas clave · haz clic en un día para ver detalles"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => canGoPrevious && setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              disabled={!canGoPrevious}
              className="rounded-full border border-[#3F3F46] bg-[#313136] p-2 text-foreground transition hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Mes anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="rounded-full border border-[#3F3F46] bg-[#313136] p-2 text-foreground transition hover:bg-accent/10 hover:text-accent"
              aria-label="Mes siguiente">
              <ChevronRight className="h-4 w-4" />
            </button>

            {/* Leyenda grupos (admin) */}
            {isAdminMode ? ENGINEER_GROUPS.map((g) => (
              <span key={g.id} className="hidden sm:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em]"
                style={{ color: g.color, borderColor: `${g.color}33`, backgroundColor: `${g.color}12` }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
                {g.label}
              </span>
            )) : (
              // Leyenda tipos de fecha (ingeniero)
              (Object.entries(DATE_CFG) as [EventType, typeof DATE_CFG[EventType]][]).map(([type, cfg]) => (
                <span key={type} className={`hidden sm:flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${cfg.pill}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Grid días */}
        <div className="grid grid-cols-7 gap-1.5">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <div key={d} className="pb-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[#888888]">{d}</div>
          ))}

          {calendarDays.map((day) => {
            const dateKey     = formatLocalDateKey(day);
            const dayEvents   = eventsByDate[dateKey] ?? [];
            const isCurrMonth = day.getMonth() === calendarMonth.getMonth();
            const isToday     = day.toDateString() === now.toDateString();
            const isSelected  = dateKey === selectedDateKey;
            const hasEvents   = dayEvents.length > 0;

            // Modo admin: contar por grupo
            const groupCounts = isAdminMode ? groupCountsForDay(dayEvents) : [];
            // Modo ingeniero: tipos únicos
            const uniqueTypes = !isAdminMode
              ? [...new Map(dayEvents.map((e) => [e.type, e])).values()]
              : [];

            return (
              <div
                key={dateKey}
                onClick={() => hasEvents && setSelectedDateKey(isSelected ? null : dateKey)}
                className={[
                  "min-h-[80px] rounded-[14px] border p-1.5 transition sm:min-h-[96px] sm:p-2",
                  isSelected
                    ? "border-accent/50 bg-accent/10 ring-1 ring-accent/30"
                    : hasEvents
                      ? "cursor-pointer border-[#3F3F46] bg-[#313136]/50 hover:border-[#52525B] hover:bg-[#313136]"
                      : "border-[#3F3F46]/50 bg-[#313136]/20",
                  !isCurrMonth ? "opacity-35" : "",
                ].join(" ")}
              >
                {/* Número del día */}
                <div className="mb-1 flex items-center justify-between">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold sm:h-6 sm:w-6 sm:text-xs ${
                    isToday ? "bg-accent text-[#111111]" : "text-foreground"
                  }`}>
                    {day.getDate()}
                  </span>
                  {dayEvents.length > 0 ? (
                    <span className="rounded-full bg-[#3F3F46] px-1.5 py-0.5 text-[9px] font-bold text-[#A1A1AA] sm:text-[10px]">
                      {dayEvents.length}
                    </span>
                  ) : null}
                </div>

                {/* ── Modo ADMIN: indicadores por área ── */}
                {isAdminMode && groupCounts.length > 0 ? (
                  <div className="mt-1 flex flex-col gap-1">
                    {groupCounts.map(({ group, count }) => (
                      <div key={group.id} className="flex items-center gap-1.5">
                        {/* Circulito del área */}
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
                          style={{ backgroundColor: group.color }}
                        />
                        {/* Nombre del área en desktop */}
                        <span
                          className="hidden truncate text-[10px] font-black uppercase tracking-[0.08em] sm:inline"
                          style={{ color: group.color }}
                        >
                          {group.label}
                        </span>
                        {/* Contador */}
                        {count > 1 ? (
                          <span
                            className="ml-auto hidden shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold sm:inline"
                            style={{ backgroundColor: `${group.color}22`, color: group.color }}
                          >
                            {count}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* ── Modo INGENIERO: dots por tipo de fecha ── */}
                {!isAdminMode && uniqueTypes.length > 0 ? (
                  <div>
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {uniqueTypes.map((ev) => (
                        <span key={ev.type} className={`h-2 w-2 rounded-full ${DATE_CFG[ev.type].dot}`} />
                      ))}
                    </div>
                    <div className="hidden sm:block mt-0.5 space-y-0.5">
                      {dayEvents.slice(0, 2).map((ev) => (
                        <div key={ev.id} className={`truncate rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${DATE_CFG[ev.type].pill}`}>
                          #{(ev.project.structuredName ?? "").split("-")[0]}
                        </div>
                      ))}
                      {dayEvents.length > 2 ? (
                        <div className="rounded bg-[#3F3F46] px-1.5 py-0.5 text-[10px] font-semibold text-[#888888]">
                          +{dayEvents.length - 2}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Panel del día seleccionado ── */}
      {selectedDateKey && selectedDate && selectedEvents.length > 0 ? (
        <div className="rounded-[28px] border border-accent/20 bg-[#27272A] p-5 shadow-panel">

          {/* Header del panel */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-[11px] font-bold text-accent">
                <CalendarDays className="h-3.5 w-3.5" />
                {selectedEvents.length} {selectedEvents.length === 1 ? "evento" : "eventos"}
              </span>
              <h3 className="mt-2 text-xl font-bold capitalize text-foreground">
                {new Intl.DateTimeFormat("es-MX", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                }).format(selectedDate)}
              </h3>
            </div>
            <button type="button" onClick={() => setSelectedDateKey(null)}
              className="shrink-0 rounded-full border border-[#3F3F46] bg-[#313136] p-2 text-[#888888] transition hover:border-danger/30 hover:text-danger">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* En modo admin: agrupar por grupo de ingeniero */}
          {isAdminMode ? (
            <div className="space-y-5">
              {/* Grupos definidos */}
              {ENGINEER_GROUPS.map((group) => {
                const groupEvents = selectedEvents.filter((ev) =>
                  group.memberIds.includes(ev.project.createdBy)
                );
                if (groupEvents.length === 0) return null;
                return (
                  <div key={group.id}>
                    <div className={`mb-3 flex items-center gap-2 rounded-xl border px-4 py-2.5 ${group.pill} ${group.card}`}>
                      <span className={`h-3 w-3 rounded-full ${group.dot}`} />
                      <span className="text-xs font-black uppercase tracking-[0.18em]">
                        {group.label}
                      </span>
                      <span className="ml-auto rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-bold">
                        {groupEvents.length} {groupEvents.length === 1 ? "evento" : "eventos"}
                      </span>
                    </div>

                    {/* Cards del grupo */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {groupEvents.map((ev) => {
                        const dateCfg      = DATE_CFG[ev.type];
                        const engineerName = users?.find((u) => u.id === ev.project.createdBy)?.name;
                        const seq          = (ev.project.structuredName ?? "").split("-")[0];

                        return (
                          <div key={ev.id} className={`flex flex-col gap-3 rounded-[18px] border-l-4 p-4 bg-[#313136] transition hover:bg-[#383840]`}
                            style={{ borderLeftColor: ev.type === "importante" ? "#A855F7" : group.color }}>
                            {/* Tipo de fecha + estado */}
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${dateCfg.pill}`}>
                                {dateCfg.label}
                              </span>
                              <StatusBadge kind="project" value={ev.project.status} />
                            </div>

                            {/* Título de fecha importante (si aplica) */}
                            {ev.type === "importante" && ev.title ? (
                              <p className="rounded-xl bg-[#EC4899]/10 px-3 py-2 text-sm font-bold text-[#EC4899] leading-snug">
                                ★ {ev.title}
                              </p>
                            ) : null}

                            {/* Info del proyecto */}
                            <div className="flex-1">
                              <p className="font-mono text-[10px] font-bold text-accent">#{seq}</p>
                              <p className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-foreground">
                                {ev.project.baseName}
                              </p>
                              <p className="mt-1 text-xs text-[#888888]">
                                {ev.project.client} · {ev.project.department}
                              </p>
                              {engineerName ? (
                                <p className="mt-1 flex items-center gap-1 text-xs">
                                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: group.color }} />
                                  <span className="font-semibold text-[#A1A1AA]">{engineerName}</span>
                                </p>
                              ) : null}
                            </div>

                            {/* Botón */}
                            <button type="button"
                              onClick={() => { onOpenProject(ev.project.id); setSelectedDateKey(null); }}
                              className="flex items-center justify-center gap-1.5 rounded-xl bg-accent/10 px-3 py-2 text-xs font-bold text-accent transition hover:bg-accent/20">
                              Ver proyecto
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Sin área — ingenieros sin grupo asignado todavía */}
              {(() => {
                const ungrouped = selectedEvents.filter((ev) => !assignedIds.has(ev.project.createdBy));
                if (ungrouped.length === 0) return null;
                return (
                  <div key="sin-area">
                    <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#3F3F46] bg-[#27272A] px-4 py-2.5">
                      <span className="h-3 w-3 rounded-full bg-[#52525B]" />
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-[#888888]">
                        Sin área asignada
                      </span>
                      <span className="ml-auto rounded-full bg-[#3F3F46] px-2 py-0.5 text-[11px] font-bold text-[#888888]">
                        {ungrouped.length} {ungrouped.length === 1 ? "evento" : "eventos"}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {ungrouped.map((ev) => {
                        const dateCfg      = DATE_CFG[ev.type];
                        const engineerName = users?.find((u) => u.id === ev.project.createdBy)?.name;
                        const seq          = (ev.project.structuredName ?? "").split("-")[0];
                        return (
                          <div key={ev.id} className="flex flex-col gap-3 rounded-[18px] border-l-4 border-l-[#52525B] bg-[#313136] p-4 transition hover:bg-[#383840]">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${dateCfg.pill}`}>{dateCfg.label}</span>
                              <StatusBadge kind="project" value={ev.project.status} />
                            </div>
                            {ev.type === "importante" && ev.title ? (
                              <p className="rounded-xl bg-[#EC4899]/10 px-3 py-2 text-sm font-bold text-[#EC4899] leading-snug">★ {ev.title}</p>
                            ) : null}
                            <div className="flex-1">
                              <p className="font-mono text-[10px] font-bold text-accent">#{seq}</p>
                              <p className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-foreground">{ev.project.baseName}</p>
                              <p className="mt-1 text-xs text-[#888888]">{ev.project.client} · {ev.project.department}</p>
                              {engineerName ? (
                                <p className="mt-1 text-xs font-semibold text-[#A1A1AA]">{engineerName}</p>
                              ) : null}
                            </div>
                            <button type="button"
                              onClick={() => { onOpenProject(ev.project.id); setSelectedDateKey(null); }}
                              className="flex items-center justify-center gap-1.5 rounded-xl bg-accent/10 px-3 py-2 text-xs font-bold text-accent transition hover:bg-accent/20">
                              Ver proyecto <ArrowUpRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            /* Modo ingeniero: cards por tipo de fecha */
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {selectedEvents.map((ev) => {
                const cfg = DATE_CFG[ev.type];
                const seq = (ev.project.structuredName ?? "").split("-")[0];
                const isImportant = ev.type === "importante";
                return (
                  <div key={ev.id} className={`flex flex-col gap-3 rounded-[18px] border p-4 transition ${cfg.card}`}>
                    {/* Header: tipo + estado + (X si es fecha importante) */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${cfg.pill}`}>{cfg.label}</span>
                      <StatusBadge kind="project" value={ev.project.status} />
                      {isImportant && onDeleteImportantDate ? (
                        <button
                          type="button"
                          onClick={() => onDeleteImportantDate(ev.project.id, ev.id)}
                          className="ml-auto rounded-full border border-danger/20 bg-danger/10 p-1 text-danger transition hover:bg-danger/25"
                          title="Eliminar fecha importante"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                    {/* Título de fecha importante */}
                    {isImportant && ev.title ? (
                      <p className="rounded-xl bg-[#3F3F46] px-3 py-2 text-sm font-bold text-[#A1A1AA] leading-snug">
                        ★ {ev.title}
                      </p>
                    ) : null}
                    <div className="flex-1">
                      <p className={`font-mono text-[10px] font-bold ${cfg.text}`}>#{seq}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-foreground">{ev.project.baseName}</p>
                      <p className="mt-1 text-xs text-[#888888]">{ev.project.client} · {ev.project.department}</p>
                    </div>
                    <button type="button"
                      onClick={() => { onOpenProject(ev.project.id); setSelectedDateKey(null); }}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-accent/10 px-3 py-2 text-xs font-bold text-accent transition hover:bg-accent/20">
                      Ver proyecto
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
