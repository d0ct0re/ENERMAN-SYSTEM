import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  const counts = demo ? getDemoChartCounts(year, scope) : buckets.map(bucket => bucket.length);
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
  const height = width < 640 ? 170 : 180;
  const bottom = height - 12;
  const x = (index: number): number => 30 + index * (width - 42) / 11;
  const y = (count: number): number => bottom - count / max * (height - 30);
  const points = counts.map((count, index) => ({ x: x(index), y: y(count) }));
  const slopes = points.slice(1).map((point, index) => (point.y - points[index].y) / (point.x - points[index].x));
  // Monotone cubic controls stay between endpoints: no negative undershoot or invented peaks.
  const tangents = points.map((_, i) => i === 0 ? slopes[0] : i === 11 ? slopes[10] : slopes[i - 1] * slopes[i] <= 0 ? 0 : 2 * slopes[i - 1] * slopes[i] / (slopes[i - 1] + slopes[i]));
  const line = points.reduce((path, point, index) => {
    if (!index) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1], dx = (point.x - previous.x) / 3;
    return path + ` C ${previous.x + dx} ${previous.y + tangents[index - 1] * dx} ${point.x - dx} ${point.y - tangents[index] * dx} ${point.x} ${point.y}`;
  }, "");
  const reset = (): void => { setSelectedMonth(null); setHoverMonth(null); };
  return <section className="engineer-project-chart" aria-label="Proyectos creados durante el año">
    <div className="engineer-project-chart__heading">
      <div><p>Actividad de proyectos</p><h2>El año en proyectos</h2>{demo && <small className="engineer-project-chart__demo">Datos de demostración</small>}<span>{total} proyectos creados en {year} · {scopeLabel}</span></div>
      <div className="engineer-project-chart__filters"><label><span>Proyectos</span><select value={scope} onChange={event => { setScope(event.target.value); reset(); }}><option value="personal">Mis proyectos</option><option value="all">Todos los proyectos</option><optgroup label="Por ingeniero">{[...engineers].sort((a, b) => a.name.localeCompare(b.name, "es")).map(engineer => <option key={engineer.id} value={`engineer:${engineer.id}`}>{engineer.name}</option>)}</optgroup></select></label><label><span>Año</span><select value={year} onChange={event => { setYear(Number(event.target.value)); reset(); }}>{years.map(value => <option key={value}>{value}</option>)}</select></label></div>
    </div>
    <div className="engineer-project-chart__legend"><span><i />Proyectos creados</span><strong>Selecciona un mes para ver sus proyectos</strong></div>
    <div className="engineer-project-chart__plot" ref={plotRef}>
      <div className="engineer-project-chart__canvas" style={{ height }} onPointerEnter={() => setHasRevealed(true)} onPointerLeave={() => setHoverMonth(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); setHoverMonth(Math.max(0, Math.min(11, Math.round(((event.clientX - rect.left) / rect.width * width - 30) / ((width - 42) / 11))))); }} onClick={() => { if (hoverMonth !== null) setSelectedMonth(previous => previous === hoverMonth ? null : hoverMonth); }} aria-label={`Proyectos creados por mes en ${year}: ${counts.map((count, index) => `${months[index]} ${count}`).join(", ")}`}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f5a524" stopOpacity=".32" /><stop offset="55%" stopColor="#f5a524" stopOpacity=".12" /><stop offset="100%" stopColor="#f5a524" stopOpacity="0" /></linearGradient>
            <clipPath id={`${fillId}-reveal`}><rect className={`engineer-project-chart__reveal${hasRevealed ? " is-animating" : ""}`} x="0" y="0" width={width} height={height} /></clipPath>
          </defs>
          {Array.from({ length: 5 }, (_, index) => <g key={index}><line x1="30" x2={width - 12} y1={y(index * step)} y2={y(index * step)} className="engineer-project-chart__grid" /><text x="20" y={y(index * step) + 4} textAnchor="end">{index * step}</text></g>)}
          {total > 0 && <g clipPath={`url(#${fillId}-reveal)`}><path className="engineer-project-chart__area" d={`${line} L ${x(11)} ${bottom} L ${x(0)} ${bottom} Z`} fill={`url(#${fillId})`} /><path className="engineer-project-chart__line" d={line} fill="none" stroke="#f5a524" strokeWidth="1.6" strokeLinejoin="round" /></g>}
          {hoverMonth !== null && total > 0 && <g><line x1={x(hoverMonth)} x2={x(hoverMonth)} y1="10" y2={bottom} stroke="var(--text-muted)" strokeDasharray="3 4" opacity=".35" /><circle cx={x(hoverMonth)} cy={y(counts[hoverMonth])} r="4" fill="#f5a524" stroke="var(--surface)" strokeWidth="2" /></g>}
        </svg>
        {hoverMonth !== null && <div role="tooltip" className="engineer-project-chart__tooltip" style={{ left: Math.max(0, Math.min(width - 170, x(hoverMonth) + 12)), top: Math.max(0, Math.min(height - 64, y(counts[hoverMonth]) - 68)) }}><strong>{months[hoverMonth]} {year}</strong><span><i />Proyectos creados<b>{counts[hoverMonth]}</b></span></div>}
        {total === 0 && <p className="engineer-project-chart__empty">No hay proyectos registrados en este año.</p>}
      </div>
      <div className="engineer-project-chart__months" onFocus={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHasRevealed(true); }}>{months.map((month, index) => <button key={month} style={{ left: x(index) }} type="button" aria-pressed={selectedMonth === index} aria-label={`${month} ${year}: ${counts[index]} proyectos. Ver listado`} onPointerEnter={() => setHoverMonth(index)} onPointerLeave={() => setHoverMonth(null)} onFocus={() => setHoverMonth(index)} onBlur={() => setHoverMonth(null)} onClick={() => setSelectedMonth(previous => previous === index ? null : index)}>{month}</button>)}</div>
    </div>
    {selectedMonth !== null && <div className="engineer-project-chart__results"><div><h3>Proyectos de {months[selectedMonth]} · {year}</h3><button type="button" onClick={reset}>Quitar filtro</button></div>{demo ? <p className="engineer-project-chart__demo-note">Vista de demostración: los valores ficticios no corresponden a expedientes reales. Desactiva la bandera para consultar tus proyectos.</p> : <EngineerProjectList projects={buckets[selectedMonth]} onOpen={onOpen} onOpenPhase={onOpenPhase} getAssignedEngineerName={getAssignedEngineerName} />}</div>}
  </section>;
}
