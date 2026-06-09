-- =============================================================
-- fase2-cleanup.sql
-- Limpieza de proyectos y solicitudes de demo/desarrollo
-- SIEMPRE ejecutar los SELECT primero para revisar antes de
-- descomentar cualquier DELETE.
-- =============================================================


-- ══════════════════════════════════════════════════════════
-- PASO 1 — REVISAR: ver todos los proyectos en la BD
-- ══════════════════════════════════════════════════════════

SELECT
    id,
    JSON_UNQUOTE(JSON_EXTRACT(payload, '$.baseName'))     AS nombre,
    JSON_UNQUOTE(JSON_EXTRACT(payload, '$.client'))       AS cliente,
    JSON_UNQUOTE(JSON_EXTRACT(payload, '$.status'))       AS estado,
    JSON_UNQUOTE(JSON_EXTRACT(payload, '$.projectType'))  AS tipo,
    JSON_EXTRACT(payload,  '$.totalSinIva')               AS total,
    created_at
FROM projects
ORDER BY created_at ASC;


-- ══════════════════════════════════════════════════════════
-- PASO 2 — IDENTIFICAR: proyectos de demo
-- Criterio A: creados antes de la fecha de go-live (ajustar)
-- ══════════════════════════════════════════════════════════

SELECT
    id,
    JSON_UNQUOTE(JSON_EXTRACT(payload, '$.baseName')) AS nombre,
    JSON_UNQUOTE(JSON_EXTRACT(payload, '$.client'))   AS cliente,
    created_at
FROM projects
WHERE created_at < '2026-04-28 00:00:00'
ORDER BY created_at ASC;


-- ══════════════════════════════════════════════════════════
-- PASO 3 — IDENTIFICAR: proyectos por IDs específicos
-- Pegar aquí los IDs que aparecieron en el PASO 1 y quieres borrar
-- ══════════════════════════════════════════════════════════

SELECT id, JSON_UNQUOTE(JSON_EXTRACT(payload, '$.baseName')) AS nombre
FROM projects
WHERE id IN (
    'proj-001',
    'proj-002'
    -- agregar más IDs según PASO 1
);


-- ══════════════════════════════════════════════════════════
-- PASO 4 — REVISAR solicitudes de demo
-- ══════════════════════════════════════════════════════════

SELECT
    id,
    JSON_UNQUOTE(JSON_EXTRACT(payload, '$.title'))      AS titulo,
    JSON_UNQUOTE(JSON_EXTRACT(payload, '$.status'))     AS estado,
    JSON_UNQUOTE(JSON_EXTRACT(payload, '$.createdBy'))  AS creado_por,
    created_at
FROM requests
ORDER BY created_at ASC;


-- ══════════════════════════════════════════════════════════
-- PASO 5 — DELETE (DESCOMENTAR SOLO DESPUÉS DE REVISAR)
-- ══════════════════════════════════════════════════════════

-- Opción A: borrar por fecha (proyectos anteriores a go-live)
/*
DELETE FROM projects
WHERE created_at < '2026-04-28 00:00:00';
*/

-- Opción B: borrar por IDs específicos
/*
DELETE FROM projects
WHERE id IN (
    'proj-001',
    'proj-002'
    -- completar con los IDs revisados en PASO 3
);
*/

-- Borrar solicitudes de demo por fecha
/*
DELETE FROM requests
WHERE created_at < '2026-04-28 00:00:00';
*/


-- ══════════════════════════════════════════════════════════
-- PASO 6 — VERIFICAR estado final después del cleanup
-- ══════════════════════════════════════════════════════════

SELECT 'projects'     AS tabla, COUNT(*) AS total FROM projects
UNION ALL
SELECT 'requests'     AS tabla, COUNT(*) AS total FROM requests
UNION ALL
SELECT 'app_users'    AS tabla, COUNT(*) AS total FROM app_users
UNION ALL
SELECT 'notifications' AS tabla, COUNT(*) AS total FROM notifications;
