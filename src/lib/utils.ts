import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ProjectItem, RequestItem } from "@/types";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parseLocalDate(date));
}

export function formatOptionalDate(date?: string): string {
  return date ? formatDate(date) : "Pendiente asignar";
}

export function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);

  if (year && month && day) {
    return new Date(year, month - 1, day);
  }

  return new Date(date);
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
  const [sequence] = project.structuredName.split("-");
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
