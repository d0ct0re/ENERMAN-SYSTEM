#!/usr/bin/env node
// Guardarraíl ligero para la migración de tokens dark/light (ver MIGRATION_LOG.md).
// Detecta colores hardcodeados y el patrón de clase rota (doble prefijo "text-")
// que causó los bugs corregidos en el commit que introdujo este script.
// Se corre manualmente como parte del "definition of done" de cada lote —
// no está atado a un git hook (ver Fase 2 del plan de migración).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const SRC_DIR = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// Archivos/patrones con excepción documentada — ver MIGRATION_LOG.md.
const ALLOWLIST = [
  // Colores categóricos fijos por equipo de ingeniería, no adaptan a claro/oscuro.
  { file: "lib/engineer-groups.ts", pattern: /#[0-9A-Fa-f]{3,8}/g },
];

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

  if (ALLOWLIST.some((entry) => relFile.endsWith(entry.file))) continue;

  for (const check of CHECKS) {
    lines.forEach((line, idx) => {
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
