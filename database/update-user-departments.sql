-- =============================================================
-- update-user-departments.sql
-- Normaliza depto/department por rol en app_users.
-- Ejecutar en phpMyAdmin -> pestana SQL.
-- =============================================================

UPDATE app_users
SET
    payload = JSON_SET(payload, '$.department', 'Gestor del sistema', '$.updatedAt', '2026-04-28T00:00:00Z'),
    updated_at = NOW()
WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '$.role')) = 'system_admin';

UPDATE app_users
SET
    payload = JSON_SET(payload, '$.department', 'Administracion', '$.updatedAt', '2026-04-28T00:00:00Z'),
    updated_at = NOW()
WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '$.role')) = 'admin';

UPDATE app_users
SET
    payload = JSON_SET(payload, '$.department', 'Supervisores', '$.updatedAt', '2026-04-28T00:00:00Z'),
    updated_at = NOW()
WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '$.role')) = 'supervisor';

UPDATE app_users
SET
    payload = JSON_SET(payload, '$.department', 'Ingenieria', '$.updatedAt', '2026-04-28T00:00:00Z'),
    updated_at = NOW()
WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '$.role')) = 'engineer';

SELECT
    id,
    JSON_UNQUOTE(JSON_EXTRACT(payload, '$.name')) AS nombre,
    JSON_UNQUOTE(JSON_EXTRACT(payload, '$.role')) AS rol,
    JSON_UNQUOTE(JSON_EXTRACT(payload, '$.email')) AS email,
    JSON_UNQUOTE(JSON_EXTRACT(payload, '$.department')) AS depto,
    sort_order
FROM app_users
ORDER BY sort_order;
