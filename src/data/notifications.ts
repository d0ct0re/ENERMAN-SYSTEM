import { NotificationItem } from "@/types";

export const notifications: NotificationItem[] = [
  {
    id: "notification-001",
    role: "engineer",
    title: "Solicitud en corrección",
    description: "La solicitud de BIMBO requiere más contexto operativo antes de su aprobación.",
    createdAt: "2026-04-19T09:10:00",
    isRead: false,
    relatedRequestId: "request-004",
  },
  {
    id: "notification-002",
    role: "admin",
    title: "Nueva solicitud crítica",
    description: "Una solicitud de ITESM llegó con posible duplicado y necesita revisión inmediata.",
    createdAt: "2026-04-19T08:20:00",
    isRead: false,
    relatedRequestId: "request-001",
  },
  {
    id: "notification-003",
    role: "supervisor",
    title: "Proyecto sin movimiento",
    description: "BIMBO-OSEH-DIAG supera 14 días sin actividad registrada.",
    createdAt: "2026-04-18T17:40:00",
    isRead: false,
    relatedProjectId: "project-004",
  },
  {
    id: "notification-004",
    role: "engineer",
    title: "Pago parcial registrado",
    description: "El proyecto 1848-CEMEX-MANT recibió el primer pago parcial.",
    createdAt: "2026-04-16T11:50:00",
    isRead: true,
    relatedProjectId: "project-002",
  },
];
