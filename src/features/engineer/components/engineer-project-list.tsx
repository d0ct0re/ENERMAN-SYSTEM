import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, FolderOpen } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { getProjectPhases, type ProjectPhase } from "@/components/cards/project-phase-steps";
import { formatOptionalDate, getProjectSequence } from "@/lib/utils";
import type { ProjectItem } from "@/types";
import "./engineer-project-list.css";

type SortKey = "folio" | "name" | "client" | "date";
interface Props {
  projects: ProjectItem[];
  onOpen: (id: string) => void;
  onOpenPhase?: (id: string, phase: ProjectPhase) => void;
  getAssignedEngineerName?: (project: ProjectItem) => string | undefined;
}

export function EngineerProjectList({ projects, onOpen, onOpenPhase, getAssignedEngineerName }: Props): JSX.Element {
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean } | null>(null);
  const rows = useMemo(() => {
    if (!sort) return projects;
    const value = (p: ProjectItem): string => sort.key === "folio" ? getProjectSequence(p) : sort.key === "name" ? p.baseName : sort.key === "client" ? p.client : p.commitmentDate ?? "";
    return [...projects].sort((a, b) => {
      const av = value(a), bv = value(b);
      if (!av || !bv) return av ? -1 : bv ? 1 : 0;
      return av.localeCompare(bv, "es", { numeric: true, sensitivity: "base" }) * (sort.ascending ? 1 : -1);
    });
  }, [projects, sort]);
  const heading = (key: SortKey, label: string): JSX.Element => (
    <th scope="col" aria-sort={sort?.key === key ? sort.ascending ? "ascending" : "descending" : "none"}>
      <button type="button" onClick={() => setSort(previous => ({ key, ascending: previous?.key === key ? !previous.ascending : true }))}>
        {label}{sort?.key === key ? sort.ascending ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} />}
      </button>
    </th>
  );
  if (!rows.length) return <div className="engineer-empty"><FolderOpen size={30} /><h3>Sin proyectos</h3><p>Los proyectos de esta sección aparecerán aquí.</p></div>;
  return <div className="engineer-project-list">
    <table aria-label="Lista de proyectos">
      <thead><tr>{heading("folio", "Folio")}{heading("name", "Proyecto")}{heading("client", "Cliente")}<th scope="col">Responsable</th><th scope="col">Estado</th><th scope="col" title="Indican si los datos de cada fase están registrados">Fases</th>{heading("date", "Compromiso")}</tr></thead>
      <tbody>{rows.map(project => <tr key={project.id} onClick={() => onOpen(project.id)}>
        <td data-label="Folio" className="engineer-project-list__folio">#{getProjectSequence(project)}</td>
        <td data-label="Proyecto"><button type="button" className="engineer-project-list__name" onClick={event => { event.stopPropagation(); onOpen(project.id); }}>{project.baseName}</button></td>
        <td data-label="Cliente"><span className="engineer-project-list__client">{project.client}</span><small>{project.department}</small></td>
        <td data-label="Responsable">{getAssignedEngineerName?.(project) || "Sin asignar"}</td>
        <td data-label="Estado"><StatusBadge kind="project" value={project.status} /></td>
        <td data-label="Fases"><div className="engineer-project-list__phases">{getProjectPhases(project).filter(phase => phase.key === "f1" || phase.key === "f2").map(phase => <button key={phase.key} type="button" className={phase.done ? "is-complete" : ""} title={`${phase.name}: ${phase.done ? "datos registrados" : "datos pendientes"}`} aria-label={`Abrir ${phase.name} de ${project.baseName}: ${phase.done ? "datos registrados" : "datos pendientes"}`} onClick={event => { event.stopPropagation(); if (onOpenPhase) onOpenPhase(project.id, phase.key); else onOpen(project.id); }}>{phase.label}</button>)}</div></td>
        <td data-label="Compromiso" className="engineer-project-list__date">{formatOptionalDate(project.commitmentDate)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
