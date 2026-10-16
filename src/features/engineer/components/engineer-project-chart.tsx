import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProjectItem, UserItem } from "@/types";
import type { ProjectPhase } from "@/components/cards/project-phase-steps";
import { EngineerProjectList } from "./engineer-project-list";
import { getDemoChartCounts } from "./engineer-project-chart.demo";
import "./engineer-project-chart.css";
const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
// Use server calendar dates without timezone shifts.
function projectMonth(project: ProjectItem): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(project.createdAt);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1 };
}
interface Props {
  engineers?: Pick<UserItem, "id" | "name">[];
  projects: ProjectItem[]; globalProjects: ProjectItem[]; onOpen: (id: string) => void;
  onOpenPhase?: (id: string, phase: ProjectPhase) => void;
  getAssignedEngineerName?: (project: ProjectItem) => string | undefined;
}
export function EngineerProjectChart({ engineers = [], projects, globalProjects, onOpen, onOpenPhase, getAssignedEngineerName }: Props): JSX.Element {
  const fillId = useId().replace(/:/g, "");
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [scope, setScope] = useState("personal");
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);
  const [hasRevealed, setHasRevealed] = useState(false);
  const selectedEngineerId = scope.startsWith("engineer:") ? scope.slice(9) : null;
  const selectedEngineer = engineers.find(engineer => engineer.id === selectedEngineerId);
  const scopeLabel = scope === "personal" ? "De tus proyectos" : selectedEngineer ? `Proyectos de ${selectedEngineer.name}` : "Todos los proyectos disponibles";
  const source = useMemo(() => scope === "personal" ? projects : selectedEngineerId ? globalProjects.filter(project => project.createdBy === selectedEngineerId || project.participants.includes(selectedEngineerId)) : globalProjects, [scope, selectedEngineerId, projects, globalProjects]);
  const years = [...new Set([currentYear, ...globalProjects.map(p => projectMonth(p)?.year).filter((y): y is number => y !== undefined)])].sort((a, b) => b - a);
  const buckets = useMemo(() => {
    const result: ProjectItem[][] = Array.from({ length: 12 }, () => []);
    source.forEach(project => { const date = projectMonth(project); if (!project.deletedAt && date?.year === year) result[date.month].push(project); });
    return result;
  }, [source, year]);
  // TODO: REMOVE_DEMO_CHART_DATA — eliminar datos de demostración antes de la entrega final.
  // Vite replaces DEV with false in production, regardless of the flag.
  const demo = import.meta.env.DEV && import.meta.env.VITE_DEMO_PROJECT_CHART === "true" && !selectedEngineerId;
  const counts = useMemo(() => demo ? getDemoChartCounts(year, scope) : buckets.map(bucket => bucket.length), [demo, year, scope, buckets]);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const step = Math.max(1, Math.ceil(Math.max(...counts) / 4));
  const max = step * 4;
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(980);
  useEffect(() => {
    if (!plotRef.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(1, entries[0].contentRect.width)));
    observer.observe(plotRef.current);
    return () => observer.disconnect();
  }, []);
  const height = width < 640 ? 190 : 220;
  const x = (index: number): number => 30 + index * (width - 42) / 11;
  const chartData = useMemo(() => counts.map((count, month) => ({ month, count })), [counts]);
  const reset = (): void => { setSelectedMonth(null); setHoverMonth(null); };
  return <section className="engineer-project-chart" aria-label="Proyectos creados durante el año">
    <div className="engineer-project-chart__heading">
      <div><p>Actividad de proyectos</p><h2>El año en proyectos</h2>{demo && <small className="engineer-project-chart__demo">Datos de demostración</small>}<span>{total} proyectos creados en {year} · {scopeLabel}</span></div>
      <div className="engineer-project-chart__filters"><label><span>Proyectos</span><select value={scope} onChange={event => { setScope(event.target.value); reset(); }}><option value="personal">Mis proyectos</option><option value="all">Todos los proyectos</option><optgroup label="Por ingeniero">{[...engineers].sort((a, b) => a.name.localeCompare(b.name, "es")).map(engineer => <option key={engineer.id} value={`engineer:${engineer.id}`}>{engineer.name}</option>)}</optgroup></select></label><label><span>Año</span><select value={year} onChange={event => { setYear(Number(event.target.value)); reset(); }}>{years.map(value => <option key={value}>{value}</option>)}</select></label></div>
    </div>
    <div className="engineer-project-chart__legend"><span><i />Proyectos creados</span><strong>Selecciona un mes para ver sus proyectos</strong></div>
    <div className="engineer-project-chart__plot" ref={plotRef}>
      <div className="engineer-project-chart__canvas" style={{ height }} onPointerEnter={() => setHasRevealed(true)} onPointerLeave={() => setHoverMonth(null)}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 12, left: 0 }} accessibilityLayer
            onMouseMove={state => { if (state.activeTooltipIndex != null) setHoverMonth(Number(state.activeTooltipIndex)); }}
            onClick={state => { if (state.activeTooltipIndex != null) { const month = Number(state.activeTooltipIndex); setSelectedMonth(previous => previous === month ? null : month); } }}>
            <defs><linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f5a524" stopOpacity={.38} /><stop offset="65%" stopColor="#f5a524" stopOpacity={.1} /><stop offset="100%" stopColor="#f5a524" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeOpacity={.4} />
            <XAxis dataKey="month" hide padding={{ left: 0, right: 0 }} />
            <YAxis width={30} domain={[0, max]} ticks={[0, step, step * 2, step * 3, max]} allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
            <Tooltip cursor={{ stroke: "var(--text-muted)", strokeDasharray: "3 5", strokeOpacity: .4 }} isAnimationActive={false}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as { month: number; count: number } | undefined;
                return active && point && hasRevealed ? <div role="tooltip" className="engineer-project-chart__tooltip"><strong>{months[point.month]} {year}</strong><span><i />Proyectos creados<b>{point.count}</b></span></div> : null;
              }} />
            {hasRevealed && total > 0 && <Area type="monotoneX" dataKey="count" name="Proyectos creados" baseValue={0} stroke="#f5a524" strokeWidth={2} fill={`url(#${fillId})`} dot={false} activeDot={{ r: 4, fill: "#f5a524", stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive="auto" animationDuration={1400} animationEasing="ease-out" />}
          </AreaChart>
        </ResponsiveContainer>
        {total === 0 && <p className="engineer-project-chart__empty">No hay proyectos registrados en este año.</p>}
      </div>
      <div className="engineer-project-chart__months" onFocus={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHasRevealed(true); }}>{months.map((month, index) => <button key={month} style={{ left: x(index) }} type="button" aria-pressed={selectedMonth === index} data-hovered={hoverMonth === index || undefined} aria-label={`${month} ${year}: ${counts[index]} proyectos. Ver listado`} onPointerEnter={() => setHoverMonth(index)} onPointerLeave={() => setHoverMonth(null)} onFocus={() => setHoverMonth(index)} onBlur={() => setHoverMonth(null)} onClick={() => setSelectedMonth(previous => previous === index ? null : index)}>{month}</button>)}</div>
    </div>
    {selectedMonth !== null && <div className="engineer-project-chart__results"><div><h3>Proyectos de {months[selectedMonth]} · {year}</h3><button type="button" onClick={reset}>Quitar filtro</button></div>{demo ? <p className="engineer-project-chart__demo-note">Vista de demostración: los valores ficticios no corresponden a expedientes reales. Desactiva la bandera para consultar tus proyectos.</p> : <EngineerProjectList projects={buckets[selectedMonth]} onOpen={onOpen} onOpenPhase={onOpenPhase} getAssignedEngineerName={getAssignedEngineerName} />}</div>}
  </section>;
}
