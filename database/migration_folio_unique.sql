-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Columna folio con restricción UNIQUE en tabla projects
-- Ejecutar en phpMyAdmin de Hostinger, EN ESTE ORDEN exacto.
-- ══════════════════════════════════════════════════════════════════════════════

-- PASO 1: Agregar columna folio (sin constraint todavía)
ALTER TABLE projects
    ADD COLUMN folio INT UNSIGNED NULL AFTER id;

-- PASO 2: Rellenar folio desde el payload JSON existente
-- structuredName tiene formato "0042-NombreProyecto-Cliente"
-- Solo se llenan proyectos cuyo structuredName empieza con dígitos.
UPDATE projects
SET folio = CAST(
    SUBSTRING_INDEX(
        JSON_UNQUOTE(JSON_EXTRACT(payload, '$.structuredName')),
        '-',
        1
    ) AS UNSIGNED
)
WHERE JSON_EXTRACT(payload, '$.structuredName') IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.structuredName')) REGEXP '^[0-9]+-';

-- PASO 3: DIAGNÓSTICO — ¿hay folios duplicados en BD antes de agregar el constraint?
-- Si este SELECT devuelve filas, hay proyectos con el mismo folio.
-- Deben resolverse manualmente antes de continuar con el PASO 4.
SELECT folio, COUNT(*) AS duplicados
FROM projects
WHERE folio IS NOT NULL
GROUP BY folio
HAVING duplicados > 1;

-- PASO 4: Agregar restricción UNIQUE (correr SOLO si el PASO 3 no devolvió filas)
-- Los NULL no cuentan para la restricción — proyectos sin folio asignado quedan libres.
ALTER TABLE projects
    ADD UNIQUE INDEX uniq_folio (folio);
