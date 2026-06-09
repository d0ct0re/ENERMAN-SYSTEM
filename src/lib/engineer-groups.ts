// Grupos de ingenieros para el calendario del administrador.
// Cada grupo tiene un color y los IDs de sus miembros.

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
    dot:  "bg-[#F97316]",
    pill: "bg-[#F97316]/15 text-[#F97316]",
    card: "border-[#F97316]/25 bg-[#F97316]/[0.04]",
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
    dot:  "bg-[#EAB308]",
    pill: "bg-[#EAB308]/15 text-[#EAB308]",
    card: "border-[#EAB308]/25 bg-[#EAB308]/[0.04]",
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
    dot:  "bg-[#0EA5E9]",
    pill: "bg-[#0EA5E9]/15 text-[#0EA5E9]",
    card: "border-[#0EA5E9]/25 bg-[#0EA5E9]/[0.04]",
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
