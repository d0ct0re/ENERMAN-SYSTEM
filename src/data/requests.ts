import { RequestItem } from "@/types";

export const requests: RequestItem[] = [
  {
    id: "request-001",
    structuredName: "ITESM-OSEH-INST-LUMINARIAS A DOBLE ALTURA",
    baseName: "Luminarias a doble altura",
    client: "ITESM",
    department: "OSEH",
    type: "INST",
    description:
      "Nueva intervención para ampliación de luminarias en el edificio norte. Se detecta posible alcance repetido con proyecto existente.",
    status: "under-review",
    createdAt: "2026-04-19",
    createdBy: "user-alan",
    duplicateOfProjectId: "project-001",
  },
  {
    id: "request-002",
    sequence: "1860",
    structuredName: "1860-FEMSA-AUTO-INGE-TABLERO DE MONITOREO FASE 2",
    baseName: "Tablero de monitoreo fase 2",
    client: "FEMSA",
    department: "AUTO",
    type: "INGE",
    description:
      "Extensión del sistema de monitoreo para integrar nuevas alarmas y visualización ejecutiva.",
    status: "approved",
    createdAt: "2026-04-10",
    createdBy: "user-alan",
    linkedProjectId: "project-003",
  },
  {
    id: "request-003",
    structuredName: "ALSEA-MANT-MNTC-CAMBIO DE ALIMENTADOR PRINCIPAL",
    baseName: "Cambio de alimentador principal",
    client: "ALSEA",
    department: "MANT",
    type: "MNTC",
    description:
      "Solicitud para sustitución de alimentador principal por sobredemanda detectada durante inspección.",
    status: "rejected",
    createdAt: "2026-04-07",
    createdBy: "user-alan",
    rejectionReason: "La información operativa es insuficiente y el cliente no autorizó corte programado.",
  },
  {
    id: "request-004",
    structuredName: "BIMBO-OSEH-ESTU-DIAGNOSTICO DE ARMONICOS EN LINEA 4",
    baseName: "Diagnóstico de armónicos en línea 4",
    client: "BIMBO",
    department: "OSEH",
    type: "ESTU",
    description:
      "Se requiere levantamiento eléctrico y validación de carga crítica en línea de producción 4.",
    status: "needs-correction",
    createdAt: "2026-04-12",
    createdBy: "user-alan",
    correctionReason: "Agregar ventana de intervención requerida y responsable de planta para el acceso.",
  },
];
