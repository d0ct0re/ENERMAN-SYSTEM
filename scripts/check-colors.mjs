#!/usr/bin/env node
// Guardarraíl ligero para la migración de tokens dark/light (ver MIGRATION_LOG.md).
// Detecta colores hardcodeados y el patrón de clase rota (doble prefijo "text-")
// que causó los bugs corregidos en el commit que introdujo este script.
// Se corre manualmente como parte del "definition of done" de cada lote —
// no está atado a un git hook (ver Fase 2 del plan de migración).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const SRC_DIR = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// Archivos/líneas con excepción documentada — ver MIGRATION_LOG.md.
// `lines` omitido = excepción para todo el archivo; con `lines`, solo esas líneas.
const ALLOWLIST = [
  // Colores categóricos fijos por equipo de ingeniería, no adaptan a claro/oscuro.
  { file: "lib/engineer-groups.ts" },
  // EngineerGroup.color se consume como string plano vía style={} y se le concatena
  // sufijo de alpha (`${g.color}33`) — no puede ser una clase Tailwind. La entrada
  // sintética "sin-área" (línea 162) y el acento "importante" (línea 426) replican
  // ese mismo patrón. Ver MIGRATION_LOG.md, Lote E.
  { file: "components/common/project-calendar.tsx", lines: [162, 426] },
  // Fondo fijo del banner "sin conexión" — mismo criterio que `warning` en
  // tailwind.config.ts (sin token de modo claro asignado). Ver MIGRATION_LOG.md, Lote A.
  { file: "App.tsx", lines: [1824] },
];

function isAllowedLine(relFile, lineNo) {
  return ALLOWLIST.some((entry) => {
    if (!relFile.endsWith(entry.file)) return false;
    return !entry.lines || entry.lines.includes(lineNo);
  });
}

const CHECKS = [
  { name: "hex literal",        pattern: /#[0-9A-Fa-f]{3,8}\b/g },
  { name: "clase gray/zinc/neutral cruda", pattern: /\b(?:bg|text|border|ring|from|to|via)-(?:gray|zinc|neutral)-\d{2,3}\b/g },
  { name: "prefijo 'text-' duplicado (clase rota)", pattern: /\b(?:bg|text|border|ring)-text-[a-z-]+\b/g },
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if ([".ts", ".tsx"].includes(extname(full))) files.push(full);
  }
  return files;
}

const normSrcDir = SRC_DIR.replace(/\\/g, "/");

let violations = 0;
for (const file of walk(SRC_DIR)) {
  const relFile = "src" + file.replace(/\\/g, "/").slice(normSrcDir.length);
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");

  for (const check of CHECKS) {
    lines.forEach((line, idx) => {
      if (isAllowedLine(relFile, idx + 1)) return;
      const matches = line.match(check.pattern);
      if (matches) {
        violations++;
        console.log(`${relFile}:${idx + 1}  [${check.name}]  ${matches.join(", ")}`);
      }
    });
  }
}

if (violations > 0) {
  console.log(`\n${violations} coincidencia(s). Revisa si son colores hardcodeados pendientes de migrar a tokens (ver MIGRATION_LOG.md) o agrega una excepción documentada en ALLOWLIST.`);
  process.exit(1);
} else {
  console.log("check:colors — sin coincidencias.");
}
