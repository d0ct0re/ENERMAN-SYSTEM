// Grupos de ingenieros para el calendario del administrador.
// Cada grupo tiene un color y los IDs de sus miembros.
//
// Los hex en `color` son categóricos fijos por equipo (no forman parte del
// sistema de tokens claro/oscuro) — por eso están en la allowlist de
// scripts/check-colors.mjs. Ver MIGRATION_LOG.md, sección "engineer-groups.ts".
// El grupo "azul" usa #0EA5E9 intencionalmente igual a --info para consistencia
// visual entre este `color` (usado en style={}) y las clases `bg-info`/`text-info`.

export interface EngineerGroup {
  id: string;
  label: string;     // nombre de área (ej. "Medición")
  color: string;     // hex para uso en style={}
  dot: string;       // clase Tailwind para bullet/dot
  pill: string;      // clase Tailwind para badge pill
  card: string;      // clase Tailwind para borde de card
  memberIds: string[];
}

export const ENGINEER_GROUPS: EngineerGroup[] = [
  {
    id: "naranja",
    label: "Medición",
    color: "#F97316",
    dot:  "bg-orange-500",
    pill: "bg-orange-500/15 text-orange-500",
    card: "border-orange-500/25 bg-orange-500/[0.04]",
    memberIds: [
      "user-alan",             // Alan Sanchez (supervisor)
      "user-benjamin-tejada",  // Benjamin Tejada
      "user-luis-garcia",      // Luis Garcia
    ],
  },
  {
    id: "amarillo",
    label: "Operación",
    color: "#EAB308",
    dot:  "bg-yellow-500",
    pill: "bg-yellow-500/15 text-yellow-500",
    card: "border-yellow-500/25 bg-yellow-500/[0.04]",
    memberIds: [
      "user-jesus",              // Jesus Plata (supervisor)
      "user-jorge-becerra",      // Jorge Becerra
      "user-angel-saucedo",      // Angel Saucedo
      "user-roberto-hernandez",  // Roberto Hernandez
      "user-cesar-gonzalez",     // Cesar Gonzalez
      "user-raul-martinez",      // Raul Martinez
      "user-luis-banda",         // Luis Banda
      "user-roberto-ferretiz",   // Roberto Ferretiz
    ],
  },
  {
    id: "azul",
    label: "Ingeniería",
    color: "#0EA5E9",
    dot:  "bg-info",
    pill: "bg-info/15 text-info",
    card: "border-info/25 bg-info/[0.04]",
    memberIds: [
      "user-servando-ramirez",  // Servando Ramirez
      "user-gabriel-colunga",   // Gabriel Colunga (aka Eduardo Colunga)
      "user-joahan-castillo",   // Joahan Castillo
      "user-oscar-noriega",     // Oscar Noriega
    ],
  },
];

/** Devuelve el grupo al que pertenece un userId, o null si no está en ninguno. */
export function getEngineerGroup(userId: string): EngineerGroup | null {
  return ENGINEER_GROUPS.find((g) => g.memberIds.includes(userId)) ?? null;
}
