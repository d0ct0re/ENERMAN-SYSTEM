import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ProjectItem, RequestItem } from "@/types";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string): string {
  // `date` puede venir undefined/vacío en registros con datos incompletos aunque el tipo
  // diga string — nunca dejar que una sola fecha faltante tumbe toda la pantalla.
  if (!date) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parseLocalDate(date));
}

export function formatOptionalDate(date?: string): string {
  return date ? formatDate(date) : "Pendiente asignar";
}

// Nunca devuelve una Date invalida — Intl.DateTimeFormat/.toLocaleDateString()/.toISOString()
// truenan con RangeError al recibir una fecha invalida, y ese throw pasaba por encima de
// cualquier chequeo `if (!date)` que no estuviera exactamente en el llamador. Ante un string
// vacio/no parseable, cae a epoch (1970) — se ve raro pero nunca tumba la pantalla.
export function parseLocalDate(date: string): Date {
  if (date) {
    const [year, month, day] = date.split("-").map(Number);
    const parsed = year && month && day ? new Date(year, month - 1, day) : new Date(date);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function daysSince(date: string): number {
  const source = new Date(date).getTime();
  const now = Date.now();
  return Math.floor((now - source) / (1000 * 60 * 60 * 24));
}

export function isNewItem(createdAt: string): boolean {
  return daysSince(createdAt) < 7;
}

export function formatRelativeActivity(date: string): string {
  const days = daysSince(date);

  if (days <= 0) {
    return "Movimiento hoy";
  }

  if (days === 1) {
    return "Último movimiento hace 1 día";
  }

  return `Último movimiento hace ${days} días`;
}

export function buildStructuredName(input: {
  sequence: string;
  client: string;
  department: string;
  lugar?: string;
  type: string;
  baseName: string;
}): string {
  const sanitize = (value: string) =>
    value
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ")
      .replace(/[^\w\s/-]/g, "");

  return [
    sanitize(input.sequence),
    sanitize(input.client),
    sanitize(input.department),
    input.lugar ? sanitize(input.lugar) : "",
    sanitize(input.type),
    sanitize(input.baseName),
  ].filter(Boolean).join("-");
}

export function buildRequestName(input: {
  client: string;
  department: string;
  lugar?: string;
  type: string;
  baseName: string;
}): string {
  const sanitize = (value: string) =>
    value
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ")
      .replace(/[^\w\s/-]/g, "");

  const parts = [
    sanitize(input.client),
    sanitize(input.department),
    input.lugar ? sanitize(input.lugar) : "",
    sanitize(input.type),
    sanitize(input.baseName),
  ].filter(Boolean);

  return parts.join("-");
}

// ── Número de proyecto (folio/consecutivo) — compartido entre vistas de todos los roles ──
export function getProjectSequenceNumber(project: Pick<ProjectItem, "structuredName">): number {
  const [sequence] = (project.structuredName ?? "").split("-");
  const n = Number(sequence);
  return Number.isFinite(n) ? n : -1;
}

export function getProjectSequence(project: Pick<ProjectItem, "structuredName">): string {
  const n = getProjectSequenceNumber(project);
  return n >= 0 ? String(n).padStart(4, "0") : "—";
}

export function getRequestSequenceNumber(
  request: Pick<RequestItem, "sequence" | "linkedProjectId">,
  projects: Pick<ProjectItem, "id" | "structuredName">[],
): number {
  if (request.sequence) {
    const n = Number(request.sequence);
    if (Number.isFinite(n)) return n;
  }
  const project = request.linkedProjectId
    ? projects.find((p) => p.id === request.linkedProjectId)
    : undefined;
  return project ? getProjectSequenceNumber(project) : -1;
}

export function getRequestSequence(
  request: Pick<RequestItem, "sequence" | "linkedProjectId">,
  projects: Pick<ProjectItem, "id" | "structuredName">[],
): string {
  const n = getRequestSequenceNumber(request, projects);
  return n >= 0 ? String(n).padStart(4, "0") : "—";
}

// ── Completitud de fase F1/F2 — mismos campos requeridos que el indicador rojo/verde ──
function hasText(v?: string): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function isProjectF1Complete(
  project: Pick<ProjectItem, "client" | "department" | "type" | "lugar" | "baseName" | "negociador" | "usuarioContacto" | "ubicacion">,
): boolean {
  const u = project.ubicacion ?? {};
  return (
    hasText(project.client) &&
    hasText(project.department) &&
    hasText(project.type) &&
    hasText(project.lugar) &&
    hasText(project.baseName) &&
    hasText(project.negociador) &&
    hasText(project.usuarioContacto) &&
    hasText(u.calle) && hasText(u.planta) && hasText(u.edificio) &&
    hasText(u.piso) && hasText(u.puerta) && hasText(u.descripcion)
  );
}

export function isProjectF2Complete(
  project: Pick<ProjectItem, "startDate" | "endDate" | "commitmentDate">,
): boolean {
  return hasText(project.startDate) && hasText(project.endDate) && hasText(project.commitmentDate);
}
