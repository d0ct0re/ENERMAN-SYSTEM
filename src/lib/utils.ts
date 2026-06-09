import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
